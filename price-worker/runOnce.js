#!/usr/bin/env node
/**
 * Price Worker: Single Run Updater
 *
 * Runs once, updates a batch of stale assets, then exits.
 * Uses advisory lock to prevent overlapping runs.
 *
 * Usage:
 *   node runOnce.js           # Update 25 assets (default)
 *   node runOnce.js --limit=5 # Update 5 assets (for testing)
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');
const stockx = require('./lib/stockx');
const { fetchPrice } = stockx;
// Note: calculateBloomPrice removed - we now store RAW prices

// Parse CLI args
const args = process.argv.slice(2);
const limitArg = args.find(a => a.startsWith('--limit='));
const BATCH_LIMIT = limitArg ? parseInt(limitArg.split('=')[1]) : 25;
const API_DELAY_MS = 1200; // 1.2s between calls (StockX rate limit)
const STOCKX_CLIENT_ID = process.env.STOCKX_CLIENT_ID;
const STOCKX_CLIENT_SECRET = process.env.STOCKX_CLIENT_SECRET;
const STOCKX_API_KEY = process.env.STOCKX_API_KEY;

// Supabase client (service role for admin access)
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('[BOOT] Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Initialize StockX module with Supabase for token persistence
stockx.init(supabase);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const isAuthError = (err) => (
  err?.status === 401 ||
  err?.message?.includes('401') ||
  err?.message?.includes('Token refresh failed') ||
  err?.message?.includes('No refresh token')
);

const withTimeout = (promise, timeoutMs) => {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const err = new Error(`Request timed out after ${timeoutMs}ms`);
      err.status = 408;
      reject(err);
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
};

async function fetchPriceWithRetry(sku, size, attempts = 3) {
  let delayMs = 500;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await withTimeout(fetchPrice(sku, size), 10_000);
    } catch (err) {
      if (isAuthError(err) || attempt === attempts) {
        throw err;
      }
      await sleep(delayMs);
      delayMs *= 2;
    }
  }
  throw new Error('Price fetch failed');
}

/**
 * Main update function
 */
async function runOnce() {
  const startTime = Date.now();
  const jobStartedAt = new Date().toISOString();  // Function-level timestamp for job tracking
  console.log('\n' + '='.repeat(60));
  console.log(`[PRICE-WORKER] Starting at ${jobStartedAt}`);
  console.log(`[CONFIG] Batch limit: ${BATCH_LIMIT}, Delay: ${API_DELAY_MS}ms`);
  console.log('='.repeat(60));

  // Step 1: Try to acquire advisory lock
  const { data: locked, error: lockError } = await supabase.rpc('acquire_price_update_lock');

  if (lockError) {
    console.error('[ERROR] Failed to acquire lock:', lockError.message);
    process.exit(1);
  }

  if (!locked) {
    console.log('[SKIP] Another price update is already running');
    process.exit(0);
  }

  console.log('[LOCK] Advisory lock acquired');

  const results = {
    updated: 0,
    failed: 0,
    skipped: 0,
    errors: [],
    authFailed: false,
    authError: null
  };

  try {
    if (!STOCKX_CLIENT_ID || !STOCKX_CLIENT_SECRET || !STOCKX_API_KEY) {
      results.authFailed = true;
      results.authError = 'Missing STOCKX_CLIENT_ID/SECRET/API_KEY';
      console.error('[AUTH] Missing StockX client credentials.');
      return results;
    }

    const { data: tokensData, error: tokensError } = await supabase.rpc('get_stockx_tokens');
    if (tokensError || !tokensData?.[0]?.refresh_token) {
      results.authFailed = true;
      results.authError = 'Missing StockX refresh token in database';
      console.error('[AUTH] Missing StockX refresh token in database.');
      return results;
    }

    // Step 2: Select stale assets (oldest checked first, nulls first)
    const { data: assets, error: fetchError } = await supabase
      .from('assets')
      .select('id, name, stockx_sku, size, price, last_price_checked_at')
      .not('stockx_sku', 'is', null)
      .order('last_price_checked_at', { ascending: true, nullsFirst: true })
      .limit(BATCH_LIMIT);

    if (fetchError) {
      throw new Error(`Database fetch failed: ${fetchError.message}`);
    }

    if (!assets || assets.length === 0) {
      console.log('[INFO] No assets with SKUs found');
      return results;
    }

    console.log(`[INFO] Processing ${assets.length} assets\n`);

    // Step 3: Update each asset with rate limiting
    for (const asset of assets) {
      const size = asset.size || '10';
      const oldPrice = asset.price;
      const now = new Date().toISOString();

      try {
        // Fetch live price from StockX
        const liveData = await fetchPriceWithRetry(asset.stockx_sku, size);
        const rawPrice = liveData.lowestAsk;  // RAW TRUTH - no markup
        const highestBid = liveData.highestBid;
        const priceChanged = oldPrice === null || oldPrice === undefined || Number(oldPrice) !== rawPrice;

        // Store RAW price (fees calculated on frontend at buy time)
        const assetUpdate = {
          base_price: rawPrice,
          price: rawPrice,              // RAW StockX Ask - matches public marketplaces
          raw_stockx_ask: rawPrice,
          raw_stockx_currency: 'USD',
          highest_bid: highestBid,
          last_price_checked_at: now,   // ALWAYS update
          updated_at_pricing: now,      // Successful check timestamp
          price_error: null,
          price_source: 'stockx'
        };

        if (priceChanged) {
          assetUpdate.last_price_updated_at = now;
          assetUpdate.price_updated_at = now;
          assetUpdate.last_price_update = now;
        }

        const { error: updateError } = await supabase
          .from('assets')
          .update(assetUpdate)
          .eq('id', asset.id);

        if (updateError) {
          throw new Error(`DB update failed: ${updateError.message}`);
        }

        // Log price history (raw price)
        await supabase.from('price_history').insert({
          asset_id: asset.id,
          price: rawPrice,
          source: 'stockx',
          created_at: now
        });

        // Sync token prices for this SKU (RAW price for wallet view)
        await supabase
          .from('tokens')
          .update({
            current_value: rawPrice,      // RAW price - wallet shows true market value
            last_price_checked_at: now,   // ALWAYS update
            value_updated_at: priceChanged ? now : undefined,
            last_price_updated_at: priceChanged ? now : undefined
          })
          .eq('sku', asset.stockx_sku);

        // Log result
        const oldValue = Number.isFinite(oldPrice) ? Number(oldPrice) : rawPrice;
        const diff = rawPrice - oldValue;
        const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '=';
        const oldDisplay = Number.isFinite(oldPrice) ? Number(oldPrice).toFixed(2) : '--';
        console.log(`✓ ${asset.stockx_sku}: $${oldDisplay} → $${rawPrice.toFixed(2)} ${arrow} (RAW)`);

        results.updated++;

      } catch (err) {
        // Check for auth failure - abort entire batch if token is dead
        if (isAuthError(err)) {
          console.error('[CRITICAL] Auth failed. Aborting batch.');
          console.error(`[CRITICAL] Error: ${err.message}`);
          results.failed++;
          results.authFailed = true;
          results.authError = err.message;
          break;  // Stop processing - don't retry with dead token
        }

        // On non-auth failure: update checked_at and error, but DON'T change price
        await supabase
          .from('assets')
          .update({
            last_price_checked_at: now,
            price_error: err.message
          })
          .eq('id', asset.id);

        console.error(`✗ ${asset.stockx_sku}: ${err.message}`);
        results.failed++;
        results.errors.push({ sku: asset.stockx_sku, error: err.message });
      }

      // Rate limit delay
      await sleep(API_DELAY_MS);
    }

    return results;

  } finally {
    // Step 4: Always release lock
    const { error: unlockError } = await supabase.rpc('release_price_update_lock');
    if (unlockError) {
      console.error('[WARN] Failed to release lock:', unlockError.message);
    } else {
      console.log('[LOCK] Advisory lock released');
    }

    // Log summary
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n' + '-'.repeat(60));
    console.log(`[DONE] Completed in ${elapsed}s`);
    console.log(`       Updated: ${results.updated} | Failed: ${results.failed}`);
    console.log('-'.repeat(60) + '\n');

    // Update cron status table
    const jobFinishedAt = new Date().toISOString();
    await supabase.from('cron_status').upsert({
      job_name: 'price-worker',
      last_run_at: jobFinishedAt,
      last_status: results.authFailed ? 'auth_failed' : (results.failed > 0 ? 'partial' : 'success'),
      last_payload: {
        updated: results.updated,
        failed: results.failed,
        elapsed_seconds: parseFloat(elapsed),
        started_at: jobStartedAt,
        finished_at: jobFinishedAt,
        auth_failed: results.authFailed || false,
        auth_error: results.authError || null,
        errors: results.errors.slice(0, 5) // Only keep first 5 errors
      },
      updated_at: jobFinishedAt
    }, { onConflict: 'job_name' });
  }
}

// Run and exit
runOnce()
  .then((results) => {
    process.exit(results.failed > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error('[FATAL]', err);
    process.exit(1);
  });
