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
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const stockx = require('./lib/stockx');
const { fetchPrice } = stockx;
const { calculateBloomPrice } = require('./lib/pricing');

// Parse CLI args
const args = process.argv.slice(2);
const limitArg = args.find(a => a.startsWith('--limit='));
const BATCH_LIMIT = limitArg ? parseInt(limitArg.split('=')[1]) : 25;
const API_DELAY_MS = 1200; // 1.2s between calls (StockX rate limit)

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

/**
 * Main update function
 */
async function runOnce() {
  const startTime = Date.now();
  console.log('\n' + '='.repeat(60));
  console.log(`[PRICE-WORKER] Starting at ${new Date().toISOString()}`);
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
    errors: []
  };

  try {
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
      const oldPrice = asset.price || 0;
      const now = new Date().toISOString();

      try {
        // Fetch live price from StockX
        const liveData = await fetchPrice(asset.stockx_sku, size);
        const lowestAsk = liveData.lowestAsk;
        const highestBid = liveData.highestBid;

        // Calculate Bloom price
        const pricing = calculateBloomPrice(lowestAsk);
        const newPrice = pricing.bloomPrice;

        // Update asset with new price
        const { error: updateError } = await supabase
          .from('assets')
          .update({
            base_price: lowestAsk,
            price: newPrice,
            highest_bid: highestBid,
            last_price_checked_at: now,
            price_updated_at: now,
            last_price_update: now,
            price_error: null,
            price_source: 'stockx'
          })
          .eq('id', asset.id);

        if (updateError) {
          throw new Error(`DB update failed: ${updateError.message}`);
        }

        // Log price history
        await supabase.from('price_history').insert({
          asset_id: asset.id,
          price: newPrice,
          source: 'stockx',
          created_at: now
        });

        // Sync token prices for this SKU
        await supabase
          .from('tokens')
          .update({
            current_value: newPrice,
            value_updated_at: now,
            last_price_checked_at: now,
            last_price_updated_at: now
          })
          .eq('sku', asset.stockx_sku);

        // Log result
        const diff = newPrice - oldPrice;
        const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '=';
        console.log(`✓ ${asset.stockx_sku}: $${oldPrice.toFixed(2)} → $${newPrice.toFixed(2)} ${arrow}`);

        results.updated++;

      } catch (err) {
        // On failure: update checked_at and error, but DON'T change price
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
      await new Promise(r => setTimeout(r, API_DELAY_MS));
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
    await supabase.from('cron_status').upsert({
      job_name: 'price-worker',
      last_run_at: new Date().toISOString(),
      last_status: results.failed > 0 ? 'partial' : 'success',
      last_payload: {
        updated: results.updated,
        failed: results.failed,
        elapsed_seconds: parseFloat(elapsed),
        errors: results.errors.slice(0, 5) // Only keep first 5 errors
      },
      updated_at: new Date().toISOString()
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
