const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const express = require('express');
const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const stockx = require('./lib/stockx');
const { fetchPrice } = stockx;
// Note: calculateBloomPrice removed - we now store RAW prices (fees on frontend)

const app = express();
app.use(express.json());

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const STOCKX_CLIENT_ID = process.env.STOCKX_CLIENT_ID;
const STOCKX_CLIENT_SECRET = process.env.STOCKX_CLIENT_SECRET;
const STOCKX_API_KEY = process.env.STOCKX_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('[BOOT] Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Initialize StockX module with Supabase for token persistence
stockx.init(supabase);

// ============================================
// CONFIGURATION
// ============================================
const BATCH_LIMIT = 25;                       // Assets per run
const API_DELAY_MS = 1200;                    // 1.2s between calls (StockX: 1/sec limit)
const CRON_SCHEDULE = '*/5 * * * *';          // Every 5 minutes
const MAX_RUNTIME_MS = 25_000;                // Safety cap per run

// ============================================
// CORE: REFRESH ASSETS (with advisory lock)
// ============================================
let lastRefreshTime = null;
let lastRefreshResults = null;
let lastCronTick = null;

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

async function refreshAllAssets() {
  const startTime = Date.now();
  const jobStartedAt = new Date().toISOString();  // Function-level timestamp for job tracking
  console.log('\n' + '='.repeat(60));
  console.log(`[REFRESH] Starting at ${jobStartedAt}`);
  console.log(`[CONFIG] Batch: ${BATCH_LIMIT}, Storing: Raw StockX Ask (no markup)`);
  console.log('='.repeat(60));

  // Try to acquire advisory lock
  const { data: locked, error: lockError } = await supabase.rpc('acquire_price_update_lock');

  if (lockError) {
    console.error('[ERROR] Failed to acquire lock:', lockError.message);
    return { success: false, error: lockError.message };
  }

  if (!locked) {
    console.log('[SKIP] Another price update is already running');
    return { skipped: true, reason: 'Lock held by another process' };
  }

  console.log('[LOCK] Advisory lock acquired');

  const results = {
    success: true,
    updated: 0,
    failed: 0,
    skipped: 0,
    details: [],
    jobId: null,
    authFailed: false,
    authError: null,
    timedOut: false
  };

  try {
    const { data: jobId, error: jobError } = await supabase.rpc('create_price_refresh_job', {
      p_items_targeted: 0
    });

    if (jobError) {
      console.error('[JOB] Failed to create job row:', jobError.message);
    } else {
      results.jobId = jobId;
      console.log(`[JOB] Created job: ${jobId}`);
    }

    if (!STOCKX_CLIENT_ID || !STOCKX_CLIENT_SECRET || !STOCKX_API_KEY) {
      console.error('[AUTH] Missing StockX client credentials.');
      results.authFailed = true;
      results.authError = 'Missing STOCKX_CLIENT_ID/SECRET/API_KEY';
      results.success = false;
      return results;
    }

    const { data: tokensData, error: tokensError } = await supabase.rpc('get_stockx_tokens');
    if (tokensError || !tokensData?.[0]?.refresh_token) {
      console.error('[AUTH] Missing StockX refresh token in database.');
      results.authFailed = true;
      results.authError = 'Missing StockX refresh token in database';
      results.success = false;
      return results;
    }

    // Select stale assets (oldest checked first)
    const { data: assets, error } = await supabase
      .from('assets')
      .select('id, name, stockx_sku, size, base_price, price, last_price_checked_at')
      .not('stockx_sku', 'is', null)
      .order('last_price_checked_at', { ascending: true, nullsFirst: true })
      .limit(BATCH_LIMIT);

    if (error) {
      console.error('[ERROR] Database fetch failed:', error.message);
      return { success: false, error: error.message };
    }

    if (!assets || assets.length === 0) {
      console.log('[WARN] No assets with SKUs found');
      return { success: true, updated: 0, failed: 0 };
    }

    if (results.jobId) {
      await supabase
        .from('price_refresh_jobs')
        .update({ items_targeted: assets.length })
        .eq('id', results.jobId);
    }

    console.log(`[INFO] Processing ${assets.length} assets\n`);

    for (const asset of assets) {
      if (Date.now() - startTime >= MAX_RUNTIME_MS) {
        results.timedOut = true;
        results.success = false;
        console.warn('[WARN] Max runtime reached. Ending batch early.');
        break;
      }

      const size = asset.size || '10';
      const oldPrice = asset.price;
      const now = new Date().toISOString();  // Define at top of loop iteration

      try {
        // Fetch live price from StockX
        const liveData = await fetchPriceWithRetry(asset.stockx_sku, size);
        const rawPrice = liveData.lowestAsk;  // RAW TRUTH - no markup
        const highestBid = liveData.highestBid;
        const priceChanged = oldPrice === null || oldPrice === undefined || Number(oldPrice) !== rawPrice;

        // Store RAW price (fees calculated on frontend at buy time)
        // Update database - ALWAYS update timestamps even if price unchanged
        const assetUpdate = {
          base_price: rawPrice,
          price: rawPrice,              // RAW StockX Ask - matches public marketplaces
          raw_stockx_ask: rawPrice,
          raw_stockx_currency: 'USD',
          highest_bid: highestBid,
          last_price_checked_at: now,   // ALWAYS update
          updated_at_pricing: now,      // Timestamp for freshness (successful check)
          price_error: null,
          price_source: 'stockx'
        };

        if (priceChanged) {
          assetUpdate.last_price_updated_at = now;
          assetUpdate.price_updated_at = now;
          assetUpdate.last_price_update = now;
        }

        const { error: assetUpdateError } = await supabase
          .from('assets')
          .update(assetUpdate)
          .eq('id', asset.id);

        if (assetUpdateError) {
          throw new Error(`DB update failed: ${assetUpdateError.message}`);
        }

        // Log price history (raw price)
        await supabase.from('price_history').insert({
          asset_id: asset.id,
          price: rawPrice,
          source: 'stockx',
          created_at: now
        });

        // Update token current_values for this SKU (RAW price for wallet view)
        await supabase
          .from('tokens')
          .update({
            current_value: rawPrice,      // RAW price - wallet shows true market value
            last_price_checked_at: now,   // ALWAYS update
            value_updated_at: priceChanged ? now : undefined,
            last_price_updated_at: priceChanged ? now : undefined
          })
          .eq('sku', asset.stockx_sku);

        const oldValue = Number.isFinite(oldPrice) ? Number(oldPrice) : rawPrice;
        const diff = rawPrice - oldValue;
        const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '=';
        const oldDisplay = Number.isFinite(oldPrice) ? Number(oldPrice).toFixed(2) : '--';
        console.log(`✓ ${asset.stockx_sku}: $${oldDisplay} → $${rawPrice.toFixed(2)} ${arrow} (RAW)`);

        results.updated++;
        results.details.push({
          sku: asset.stockx_sku,
          name: asset.name,
          oldPrice: oldPrice ?? null,
          newPrice: rawPrice,
          rawAsk: rawPrice
        });

        await sleep(API_DELAY_MS);

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

        const isNoPriceData = err?.message?.includes('No price data');
        if (isNoPriceData) {
          await supabase
            .from('assets')
            .update({
              last_price_checked_at: now,
              price_error: err.message
            })
            .eq('id', asset.id);

          console.warn(`~ ${asset.stockx_sku}: ${err.message} (skipped)`);
          results.skipped++;
          results.details.push({
            sku: asset.stockx_sku,
            name: asset.name,
            skipped: true,
            reason: err.message
          });
          await sleep(API_DELAY_MS);
          continue;
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
        results.details.push({
          sku: asset.stockx_sku,
          name: asset.name,
          error: err.message
        });
        await sleep(API_DELAY_MS);
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n' + '-'.repeat(60));
    console.log(`[DONE] Completed in ${elapsed}s`);
    console.log(`       Updated: ${results.updated} | Failed: ${results.failed}`);
    console.log('-'.repeat(60) + '\n');

    lastRefreshTime = new Date().toISOString();
    lastRefreshResults = results;

    return results;

  } finally {
    if (results.jobId) {
      const status = results.authFailed
        ? 'auth_failed'
        : (results.updated > 0 ? (results.failed > 0 || results.timedOut ? 'partial' : 'success') : 'error');
      await supabase
        .from('price_refresh_jobs')
        .update({
          finished_at: new Date().toISOString(),
          status,
          updated_count: results.updated,
          failed_count: results.failed,
          skipped_count: results.skipped,
          items_updated: results.updated,
          items_failed: results.failed,
          error_summary: results.authError || (results.timedOut ? 'Max runtime reached' : null),
          error: results.authError || (results.timedOut ? 'Max runtime reached' : null)
        })
        .eq('id', results.jobId);
    }

    // Always release lock
    const { error: unlockError } = await supabase.rpc('release_price_update_lock');
    if (unlockError) {
      console.error('[WARN] Failed to release lock:', unlockError.message);
    } else {
      console.log('[LOCK] Advisory lock released');
    }
  }
}

// ============================================
// EXPRESS ENDPOINTS
// ============================================

app.get('/', (req, res) => {
  res.json({
    status: 'Bloom Price Worker',
    source: 'StockX Official API',
    pricing: 'RAW StockX Ask (no markup)',
    note: 'Fees calculated on frontend at buy time',
    schedule: CRON_SCHEDULE,
    endpoints: {
      'GET /run-now': 'Trigger instant update (non-blocking)',
      'GET /refresh': 'Trigger manual refresh (waits for completion)',
      'GET /status': 'Check worker status',
      'GET /token-health': 'Check StockX token status',
      'GET /health': 'Health check'
    },
    lastRefresh: lastRefreshTime
  });
});

app.get('/refresh', async (req, res) => {
  console.log('[API] Refresh triggered');
  const results = await refreshAllAssets();
  res.json(results);
});

app.post('/refresh', async (req, res) => {
  console.log('[API] Refresh triggered via POST');
  const results = await refreshAllAssets();
  res.json(results);
});

app.get('/run-now', (req, res) => {
  console.log('[MANUAL TRIGGER] User requested immediate update');

  // Fire and forget - don't await
  refreshAllAssets()
    .then(results => {
      console.log(`[MANUAL TRIGGER] Completed: ${results?.updated || 0} updated, ${results?.failed || 0} failed`);
    })
    .catch(err => {
      console.error('[MANUAL TRIGGER] Error:', err.message);
    });

  // Return immediately
  res.json({
    status: 'Update started',
    timestamp: new Date().toISOString(),
    message: 'Check /status for results when complete'
  });
});

app.get('/status', (req, res) => {
  (async () => {
    try {
      const { data: lastJob, error: lastJobError } = await supabase
        .from('price_refresh_jobs')
        .select('id, status, started_at, finished_at, updated_count, failed_count, skipped_count, items_updated, items_failed, error_summary, error')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastJobError) {
        throw new Error(lastJobError.message);
      }

      const { data: lastSuccess, error: lastSuccessError } = await supabase
        .from('price_refresh_jobs')
        .select('finished_at')
        .in('status', ['success', 'partial'])
        .order('finished_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastSuccessError) {
        throw new Error(lastSuccessError.message);
      }

      const lastSuccessAt = lastSuccess?.finished_at || null;
      const minutesSinceLastSuccess = lastSuccessAt
        ? Math.round((Date.now() - new Date(lastSuccessAt).getTime()) / 60000)
        : null;
      const pricingFresh = minutesSinceLastSuccess !== null && minutesSinceLastSuccess <= 15;

      res.json({
        ok: true,
        schedule: CRON_SCHEDULE,
        batchLimit: BATCH_LIMIT,
        lastCronTick,
        lastRefresh: lastRefreshTime,
        lastResults: lastRefreshResults,
        lastJob: lastJob || null,
        lastSuccessAt,
        minutesSinceLastSuccess,
        pricingFresh,
        pricingStatus: pricingFresh ? 'fresh' : 'stale',
        pricing: 'RAW StockX Ask (fees on frontend)'
      });
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err.message,
        schedule: CRON_SCHEDULE,
        batchLimit: BATCH_LIMIT
      });
    }
  })();
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    lastRefresh: lastRefreshTime
  });
});

app.get('/token-health', async (req, res) => {
  try {
    const health = await stockx.getTokenHealth();
    const supabaseHost = (() => {
      try { return new URL(SUPABASE_URL).host; } catch { return 'invalid'; }
    })();

    // Determine overall health status
    const ok = Boolean(health.ok);

    res.json({
      ok,
      status: ok ? 'healthy' : 'unhealthy',
      supabaseHost,
      nodeVersion: process.version,
      ...health,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      status: 'error',
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/asset/:id', async (req, res) => {
  const { data: asset, error } = await supabase
    .from('assets')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error || !asset) {
    return res.status(404).json({ error: 'Asset not found' });
  }

  res.json({
    ...asset,
    note: 'price is RAW StockX Ask - fees calculated on frontend'
  });
});

// ============================================
// CRON SCHEDULER
// ============================================
let cronTask = null;

function startCron() {
  if (cronTask) {
    cronTask.stop();
  }

  console.log(`[CRON] Scheduling price updates: ${CRON_SCHEDULE}`);

  cronTask = cron.schedule(CRON_SCHEDULE, async () => {
    lastCronTick = new Date().toISOString();
    console.log(`[CRON] Starting price update... ${lastCronTick}`);
    try {
      const results = await refreshAllAssets();
      console.log(`[CRON] Done. Updated ${results?.updated || 0}, Failed ${results?.failed || 0}`);
    } catch (err) {
      console.error('[CRON] Error during refresh:', err.message);
    }
  }, {
    scheduled: true,
    timezone: 'America/New_York'
  });

  return cronTask;
}

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log('');
  console.log('='.repeat(60));
  console.log('  BLOOM PRICE WORKER');
  console.log('='.repeat(60));
  console.log(`  Port: ${PORT}`);
  console.log(`  Source: StockX Official API`);
  console.log(`  Pricing: RAW StockX Ask (no markup)`);
  console.log(`  Batch Size: ${BATCH_LIMIT} assets per run`);
  console.log(`  Schedule: ${CRON_SCHEDULE} (every 5 minutes)`);
  console.log(`  Note: Fees calculated on frontend at buy time`);
  console.log('');
  console.log('  Environment Check:');
  const supabaseHost = (() => { try { return new URL(SUPABASE_URL).host; } catch { return 'INVALID'; } })();
  console.log(`    Supabase Host: ${supabaseHost}`);
  console.log(`    SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_KEY ? '✓ SET' : '✗ MISSING'}`);
  console.log(`    STOCKX_CLIENT_ID: ${process.env.STOCKX_CLIENT_ID ? '✓ SET' : '✗ MISSING'}`);
  console.log(`    STOCKX_CLIENT_SECRET: ${process.env.STOCKX_CLIENT_SECRET ? '✓ SET' : '✗ MISSING'}`);
  console.log(`    STOCKX_API_KEY: ${process.env.STOCKX_API_KEY ? '✓ SET' : '✗ MISSING'}`);
  console.log('='.repeat(60));
  console.log('');

  // Start cron scheduler
  startCron();

  // Run initial refresh on startup (optional, uncomment to enable)
  // refreshAllAssets();
});
