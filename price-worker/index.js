require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const { fetchPrice } = require('./lib/rapidapi');

const app = express();
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ============================================
// PRICING CONSTANTS (Michigan All-In Formula)
// ============================================
const STOCKX_PROCESSING_RATE = 0.0483;  // 4.83%
const MI_TAX_RATE = 0.06;               // 6% Michigan Sales Tax
const STOCKX_SHIPPING = 14.95;          // Flat Rate
const VOLATILITY_BUFFER = 1.015;        // 1.5% safety margin
const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const API_DELAY_MS = 1500;              // 1.5 seconds between API calls

// TESTING: Limit to first N assets to conserve API credits
const TEST_MODE = true;
const TEST_LIMIT = 3;

// ============================================
// PRICING FORMULA
// (Ask + 4.83% + 6% Tax + $14.95) × 1.015
// ============================================
function calculateBloomPrice(lowestAsk) {
  const processingFee = Math.round(lowestAsk * STOCKX_PROCESSING_RATE * 100) / 100;
  const taxBase = lowestAsk + processingFee;
  const estimatedTax = Math.round(taxBase * MI_TAX_RATE * 100) / 100;
  const landedCost = Math.round((lowestAsk + processingFee + estimatedTax + STOCKX_SHIPPING) * 100) / 100;
  const bloomPrice = Math.ceil(landedCost * VOLATILITY_BUFFER * 100) / 100;

  return {
    lowestAsk,
    processingFee,
    estimatedTax,
    shipping: STOCKX_SHIPPING,
    landedCost,
    bloomPrice,
    buffer: '1.5%'
  };
}

// ============================================
// CORE: REFRESH ALL ASSETS
// ============================================
let isRefreshing = false;
let lastRefreshTime = null;
let lastRefreshResults = null;

async function refreshAllAssets() {
  if (isRefreshing) {
    console.log('[SKIP] Refresh already in progress...');
    return { skipped: true, reason: 'Already refreshing' };
  }

  isRefreshing = true;
  const startTime = Date.now();
  console.log('\n' + '='.repeat(60));
  console.log(`[REFRESH] Starting at ${new Date().toISOString()}`);
  console.log('[SOURCE] RapidAPI Sneaker Database');
  if (TEST_MODE) console.log(`[TEST MODE] Limited to ${TEST_LIMIT} assets`);
  console.log('='.repeat(60));

  try {
    // Fetch all assets with SKUs
    const { data: allAssets, error } = await supabase
      .from('assets')
      .select('id, name, stockx_sku, size, base_price, price')
      .not('stockx_sku', 'is', null);

    if (error) {
      console.error('[ERROR] Database fetch failed:', error.message);
      return { success: false, error: error.message };
    }

    if (!allAssets || allAssets.length === 0) {
      console.log('[WARN] No assets with SKUs found');
      return { success: true, updated: 0, failed: 0 };
    }

    // TESTING: Limit to first N assets
    const assets = TEST_MODE ? allAssets.slice(0, TEST_LIMIT) : allAssets;

    console.log(`[INFO] Processing ${assets.length} of ${allAssets.length} assets\n`);

    const results = {
      success: true,
      updated: 0,
      failed: 0,
      unchanged: 0,
      details: []
    };

    for (const asset of assets) {
      const size = asset.size || '10';
      const oldBasePrice = asset.base_price || 0;

      try {
        // FETCH LIVE PRICE FROM RAPIDAPI
        const liveData = await fetchPrice(asset.stockx_sku, size);
        const newLowestAsk = liveData.lowestAsk;

        // CALCULATE NEW BLOOM PRICE
        const pricing = calculateBloomPrice(newLowestAsk);
        const newBloomPrice = pricing.bloomPrice;

        // CHECK IF PRICE CHANGED
        const priceChanged = Math.abs(newLowestAsk - oldBasePrice) >= 1;

        // UPDATE DATABASE
        const { error: updateError } = await supabase
          .from('assets')
          .update({
            base_price: newLowestAsk,
            price: newBloomPrice,
            price_updated_at: new Date().toISOString(),
            last_price_update: new Date().toISOString()
          })
          .eq('id', asset.id);

        if (updateError) {
          throw new Error(`DB Update failed: ${updateError.message}`);
        }

        // INSERT PRICE HISTORY
        await supabase.from('price_history').insert({
          asset_id: asset.id,
          price: newBloomPrice,
          source: 'rapidapi',
          created_at: new Date().toISOString()
        });

        if (priceChanged) {
          const direction = newLowestAsk > oldBasePrice ? '↑' : '↓';
          const diff = Math.abs(newLowestAsk - oldBasePrice);
          console.log(`[RAPIDAPI] Success: ${asset.name} -> $${newBloomPrice} (was $${oldBasePrice}, ${direction}$${diff.toFixed(0)})`);
          results.updated++;
        } else {
          console.log(`[RAPIDAPI] Success: ${asset.name} -> $${newBloomPrice} (unchanged)`);
          results.unchanged++;
        }

        results.details.push({
          name: asset.name,
          oldBase: oldBasePrice,
          newBase: newLowestAsk,
          bloomPrice: newBloomPrice,
          changed: priceChanged
        });

        // Rate limit
        await new Promise(r => setTimeout(r, API_DELAY_MS));

      } catch (err) {
        console.error(`[RAPIDAPI] FAIL: ${asset.name} - ${err.message}`);
        results.failed++;
        results.details.push({
          name: asset.name,
          error: err.message
        });
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n' + '-'.repeat(60));
    console.log(`[DONE] Completed in ${elapsed}s`);
    console.log(`       Updated: ${results.updated} | Unchanged: ${results.unchanged} | Failed: ${results.failed}`);
    console.log('-'.repeat(60) + '\n');

    lastRefreshTime = new Date().toISOString();
    lastRefreshResults = results;

    return results;

  } finally {
    isRefreshing = false;
  }
}

// ============================================
// EXPRESS ENDPOINTS
// ============================================

// Health check
app.get('/', (req, res) => {
  const example = calculateBloomPrice(300);
  res.json({
    status: 'Bloom Price Worker - LIVE',
    source: 'RapidAPI Sneaker Database',
    testMode: TEST_MODE ? `Limited to ${TEST_LIMIT} assets` : 'OFF',
    formula: '(Ask + 4.83% + 6% Tax + $14.95) × 1.015',
    example: {
      input: '$300 StockX Ask',
      output: `$${example.bloomPrice} Bloom Price`
    },
    lastRefresh: lastRefreshTime
  });
});

// Manual refresh trigger
app.get('/refresh', async (req, res) => {
  console.log('[MANUAL] Refresh triggered');
  const results = await refreshAllAssets();
  res.json(results);
});

app.post('/refresh', async (req, res) => {
  console.log('[MANUAL] Refresh triggered via POST');
  const results = await refreshAllAssets();
  res.json(results);
});

// Status endpoint
app.get('/status', (req, res) => {
  res.json({
    isRefreshing,
    testMode: TEST_MODE,
    testLimit: TEST_LIMIT,
    lastRefresh: lastRefreshTime,
    lastResults: lastRefreshResults,
    source: 'RapidAPI'
  });
});

// Get single asset
app.get('/asset/:id', async (req, res) => {
  const { id } = req.params;

  const { data: asset, error } = await supabase
    .from('assets')
    .select('*')
    .eq('id', id)
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
// START SERVER & CRON
// ============================================
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  const example = calculateBloomPrice(300);
  console.log('');
  console.log('='.repeat(60));
  console.log('  BLOOM PRICE WORKER - RAPIDAPI');
  console.log('='.repeat(60));
  console.log(`  Port: ${PORT}`);
  console.log(`  Source: RapidAPI Sneaker Database`);
  console.log(`  Test Mode: ${TEST_MODE ? `ON (${TEST_LIMIT} assets)` : 'OFF'}`);
  console.log(`  Refresh: Every 10 minutes`);
  console.log(`  Formula: (Ask + 4.83% + 6% + $14.95) × 1.015`);
  console.log(`  Example: $300 Ask -> $${example.bloomPrice} Bloom`);
  console.log('='.repeat(60));
  console.log('');

  // Run initial refresh on startup
  console.log('[STARTUP] Running initial price refresh...');
  refreshAllAssets();

  // Schedule refresh every 10 minutes
  cron.schedule('*/10 * * * *', () => {
    console.log('\n[CRON] Scheduled refresh...');
    refreshAllAssets();
  });

  console.log('[CRON] Scheduled: Every 10 minutes');
});
