require('dotenv').config();
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

// ============================================
// CORE: REFRESH ASSETS (with advisory lock)
// ============================================
let lastRefreshTime = null;
let lastRefreshResults = null;
let lastCronTick = null;

async function refreshAllAssets() {
  const startTime = Date.now();
  console.log('\n' + '='.repeat(60));
  console.log(`[REFRESH] Starting at ${new Date().toISOString()}`);
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
    details: []
  };

  try {
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

    console.log(`[INFO] Processing ${assets.length} assets\n`);

    for (const asset of assets) {
      const size = asset.size || '10';
      const oldPrice = asset.price || 0;
      const now = new Date().toISOString();

      try {
        // Fetch live price from StockX
        const liveData = await fetchPrice(asset.stockx_sku, size);
        const rawPrice = liveData.lowestAsk;  // RAW TRUTH - no markup
        const highestBid = liveData.highestBid;

        // Store RAW price (fees calculated on frontend at buy time)
        // Update database - ALWAYS update timestamps even if price unchanged
        await supabase
          .from('assets')
          .update({
            base_price: rawPrice,
            price: rawPrice,              // RAW StockX Ask - matches public marketplaces
            highest_bid: highestBid,
            last_price_checked_at: now,   // ALWAYS update
            price_updated_at: now,        // ALWAYS update
            last_price_update: now,       // ALWAYS update
            price_error: null,
            price_source: 'stockx'
          })
          .eq('id', asset.id);

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
            value_updated_at: now,        // ALWAYS update
            last_price_checked_at: now,   // ALWAYS update
            last_price_updated_at: now    // ALWAYS update
          })
          .eq('sku', asset.stockx_sku);

        const diff = rawPrice - oldPrice;
        const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '=';
        console.log(`✓ ${asset.stockx_sku}: $${oldPrice.toFixed(2)} → $${rawPrice.toFixed(2)} ${arrow} (RAW)`);

        results.updated++;
        results.details.push({
          sku: asset.stockx_sku,
          name: asset.name,
          oldPrice,
          newPrice: rawPrice,
          rawAsk: rawPrice
        });

        await new Promise(r => setTimeout(r, API_DELAY_MS));

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
        results.details.push({
          sku: asset.stockx_sku,
          name: asset.name,
          error: err.message
        });
        await new Promise(r => setTimeout(r, API_DELAY_MS));
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n' + '-'.repeat(60));
    console.log(`[DONE] Completed in ${elapsed}s`);
    console.log(`       Updated: ${results.updated} | Failed: ${results.failed}`);
    console.log('-'.repeat(60) + '\n');

    lastRefreshTime = new Date().toISOString();
    lastRefreshResults = results;

    // Update cron status table
    await supabase.from('cron_status').upsert({
      job_name: 'price-worker',
      last_run_at: now,
      last_status: results.failed > 0 ? 'partial' : 'success',
      last_payload: {
        updated: results.updated,
        failed: results.failed,
        elapsed_seconds: parseFloat(elapsed)
      },
      updated_at: now
    }, { onConflict: 'job_name' });

    return results;

  } finally {
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
  res.json({
    lastRefresh: lastRefreshTime,
    lastResults: lastRefreshResults,
    lastCronTick,
    schedule: CRON_SCHEDULE,
    batchLimit: BATCH_LIMIT,
    pricing: 'RAW StockX Ask (fees on frontend)'
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    lastRefresh: lastRefreshTime
  });
});

app.get('/token-health', async (req, res) => {
  const health = await stockx.getTokenHealth();
  res.json(health);
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
    pricing: asset.base_price ? calculateBloomPrice(asset.base_price) : null
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
  console.log('='.repeat(60));
  console.log('');

  // Start cron scheduler
  startCron();

  // Run initial refresh on startup (optional, uncomment to enable)
  // refreshAllAssets();
});
