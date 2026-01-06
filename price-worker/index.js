require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { fetchPrice } = require('./lib/stockx'); // Official StockX API

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
const API_DELAY_MS = 1200;              // 1.2 seconds between API calls (StockX rate limit: 1/sec)

// PRODUCTION: Process all assets
const TEST_MODE = false;
const TEST_LIMIT = 50; // Not used when TEST_MODE is false

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
        const newHighestBid = liveData.highestBid; // Estimated or real bid

        // CALCULATE NEW BLOOM PRICE
        const pricing = calculateBloomPrice(newLowestAsk);
        const newBloomPrice = pricing.bloomPrice;

        // CHECK IF PRICE CHANGED
        const priceChanged = Math.abs(newLowestAsk - oldBasePrice) >= 1;

        // UPDATE DATABASE (including bid for spread display)
        const { error: updateError } = await supabase
          .from('assets')
          .update({
            base_price: newLowestAsk,
            price: newBloomPrice,
            highest_bid: newHighestBid,
            bid_updated_at: new Date().toISOString(),
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
    status: 'Bloom Price Worker - Manual Pricing Mode',
    mode: 'Manual pricing only (automated RapidAPI refresh disabled)',
    formula: '(Ask + 4.83% + 6% Tax + $14.95) × 1.015',
    example: {
      input: '$300 StockX Ask',
      output: `$${example.bloomPrice} Bloom Price`
    },
    endpoints: {
      'POST /manual-price': 'Set size-specific prices',
      'GET /refresh': 'Manual RapidAPI refresh (optional)'
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
// MANUAL PRICE OVERRIDE
// Bypass RapidAPI and set exact StockX prices
// ============================================
app.post('/manual-price', async (req, res) => {
  const { asset_id, base_price, size } = req.body;

  if (!asset_id || !base_price) {
    return res.status(400).json({ error: 'asset_id and base_price required' });
  }

  if (typeof base_price !== 'number' || base_price <= 0) {
    return res.status(400).json({ error: 'base_price must be a positive number' });
  }

  // Calculate Bloom price using the same formula
  const pricing = calculateBloomPrice(base_price);

  // Estimate bid (12% spread) for manual pricing too
  const ESTIMATED_SPREAD = 0.12;
  const estimatedBid = Math.round(base_price * (1 - ESTIMATED_SPREAD) * 100) / 100;

  // Update the asset in database
  const updateData = {
    base_price: base_price,
    price: pricing.bloomPrice,
    highest_bid: estimatedBid,
    bid_updated_at: new Date().toISOString(),
    price_updated_at: new Date().toISOString(),
    last_price_update: new Date().toISOString()
  };

  if (size) {
    updateData.size = size;
  }

  const { data: asset, error } = await supabase
    .from('assets')
    .update(updateData)
    .eq('id', asset_id)
    .select('id, name, stockx_sku, size')
    .single();

  if (error) {
    console.error('[MANUAL] Database error:', error.message);
    return res.status(500).json({ error: error.message });
  }

  if (!asset) {
    return res.status(404).json({ error: 'Asset not found' });
  }

  // Insert price history
  await supabase.from('price_history').insert({
    asset_id: asset_id,
    price: pricing.bloomPrice,
    source: 'manual',
    created_at: new Date().toISOString()
  });

  console.log(`[MANUAL] ${asset.name}: Ask $${base_price} | Bid $${estimatedBid} | Bloom $${pricing.bloomPrice}`);

  res.json({
    success: true,
    asset: {
      id: asset.id,
      name: asset.name,
      sku: asset.stockx_sku,
      size: asset.size
    },
    pricing: {
      base_price: base_price,
      highest_bid: estimatedBid,
      spread: Math.round((base_price - estimatedBid) / base_price * 100),
      bloomPrice: pricing.bloomPrice,
      processingFee: pricing.processingFee,
      estimatedTax: pricing.estimatedTax,
      shipping: pricing.shipping,
      landedCost: pricing.landedCost,
      buffer: pricing.buffer
    }
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
  console.log('  BLOOM PRICE WORKER - MANUAL PRICING MODE');
  console.log('='.repeat(60));
  console.log(`  Port: ${PORT}`);
  console.log(`  Mode: Manual pricing only (RapidAPI disabled)`);
  console.log(`  Formula: (Ask + 4.83% + 6% + $14.95) × 1.015`);
  console.log(`  Example: $300 Ask -> $${example.bloomPrice} Bloom`);
  console.log('');
  console.log('  Endpoints:');
  console.log('    POST /manual-price  - Set size-specific prices');
  console.log('    GET  /refresh       - Manual RapidAPI refresh (optional)');
  console.log('='.repeat(60));
  console.log('');
});
