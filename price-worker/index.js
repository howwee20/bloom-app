require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const SneaksAPI = require('sneaks-api');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

const sneaks = new SneaksAPI();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ============================================
// PRICING CONSTANTS (Calibrated from StockX MI)
// ============================================
const STOCKX_PROCESSING_RATE = 0.0483;  // 4.83%
const MI_TAX_RATE = 0.06;               // 6% Michigan Sales Tax
const STOCKX_SHIPPING = 14.95;          // Flat Rate
const VOLATILITY_BUFFER = 1.015;        // 1.5% safety margin
const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const API_DELAY_MS = 3000;              // 3 seconds between API calls

// ============================================
// PRICING FORMULA
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
// FETCH LIVE PRICE FROM STOCKX VIA SNEAKS-API
// ============================================
function fetchLivePrice(sku, size) {
  return new Promise((resolve, reject) => {
    sneaks.getProductPrices(sku, (err, product) => {
      if (err) {
        return reject(new Error(`API Error: ${err.message || 'Unknown'}`));
      }
      if (!product || !product.resellPrices?.stockX) {
        return reject(new Error('No StockX data returned'));
      }

      // Try multiple size formats
      const sizeFormats = [size, `${size}`, `US ${size}`, `${size} US`, String(size)];
      let livePrice = null;

      for (const fmt of sizeFormats) {
        livePrice = product.resellPrices.stockX[fmt];
        if (livePrice) break;
      }

      if (!livePrice) {
        const availableSizes = Object.keys(product.resellPrices.stockX);
        return reject(new Error(`Size ${size} not found. Available: ${availableSizes.join(', ')}`));
      }

      resolve({
        lowestAsk: livePrice,
        productName: product.shoeName,
        availableSizes: Object.keys(product.resellPrices.stockX)
      });
    });
  });
}

// ============================================
// CORE: REFRESH ALL ASSETS
// ============================================
let isRefreshing = false;

async function refreshAllAssets() {
  if (isRefreshing) {
    console.log('[SKIP] Refresh already in progress...');
    return { skipped: true, reason: 'Already refreshing' };
  }

  isRefreshing = true;
  const startTime = Date.now();
  console.log('\n' + '='.repeat(60));
  console.log(`[REFRESH] Starting price refresh at ${new Date().toISOString()}`);
  console.log('='.repeat(60));

  try {
    // Fetch all assets with SKUs
    const { data: assets, error } = await supabase
      .from('assets')
      .select('id, name, stockx_sku, size, base_price, price')
      .not('stockx_sku', 'is', null);

    if (error) {
      console.error('[ERROR] Database fetch failed:', error.message);
      return { success: false, error: error.message };
    }

    if (!assets || assets.length === 0) {
      console.log('[WARN] No assets with SKUs found in database');
      return { success: true, updated: 0, failed: 0 };
    }

    console.log(`[INFO] Found ${assets.length} assets to refresh\n`);

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
      const oldBloomPrice = asset.price || 0;

      try {
        // FETCH LIVE PRICE
        const liveData = await fetchLivePrice(asset.stockx_sku, size);
        const newLowestAsk = liveData.lowestAsk;

        // CALCULATE NEW BLOOM PRICE
        const pricing = calculateBloomPrice(newLowestAsk);
        const newBloomPrice = pricing.bloomPrice;

        // CHECK IF PRICE CHANGED
        const priceChanged = Math.abs(newLowestAsk - oldBasePrice) >= 1;

        if (priceChanged) {
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
            source: 'live_api',
            created_at: new Date().toISOString()
          });

          const direction = newLowestAsk > oldBasePrice ? '↑' : '↓';
          const diff = newLowestAsk - oldBasePrice;
          console.log(`[UPDATE] ${asset.name}: Base $${oldBasePrice} -> $${newLowestAsk} (${direction}$${Math.abs(diff).toFixed(0)}). Bloom Price: $${newBloomPrice}`);

          results.updated++;
          results.details.push({
            name: asset.name,
            oldBase: oldBasePrice,
            newBase: newLowestAsk,
            oldBloom: oldBloomPrice,
            newBloom: newBloomPrice,
            change: diff
          });
        } else {
          // Just update timestamp, price unchanged
          await supabase
            .from('assets')
            .update({
              price_updated_at: new Date().toISOString(),
              last_price_update: new Date().toISOString()
            })
            .eq('id', asset.id);

          console.log(`[OK] ${asset.name}: $${newLowestAsk} (unchanged)`);
          results.unchanged++;
        }

        // Rate limit: wait between API calls
        await new Promise(r => setTimeout(r, API_DELAY_MS));

      } catch (err) {
        console.error(`[FAIL] ${asset.name}: ${err.message}`);
        results.failed++;
        results.details.push({
          name: asset.name,
          error: err.message
        });
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n' + '-'.repeat(60));
    console.log(`[DONE] Refresh complete in ${elapsed}s`);
    console.log(`       Updated: ${results.updated} | Unchanged: ${results.unchanged} | Failed: ${results.failed}`);
    console.log('-'.repeat(60) + '\n');

    return results;

  } finally {
    isRefreshing = false;
  }
}

// ============================================
// EXPRESS ENDPOINTS
// ============================================

// Health check with live example
app.get('/', (req, res) => {
  const example = calculateBloomPrice(300);
  res.json({
    status: 'Bloom Price Worker - LIVE',
    mode: 'Automated refresh every 10 minutes',
    formula: '(Ask + 4.83% + 6% Tax + $14.95) × 1.015',
    example: {
      input: '$300 StockX Ask',
      output: `$${example.bloomPrice} Bloom Price`,
      breakdown: example
    },
    endpoints: {
      '/refresh': 'POST - Trigger manual refresh (for app pull-to-refresh)',
      '/status': 'GET - Check last refresh status',
      '/asset/:id': 'GET - Get single asset price'
    }
  });
});

// Manual refresh trigger (for app pull-to-refresh)
app.post('/refresh', async (req, res) => {
  console.log('[MANUAL] Refresh triggered via API');
  const results = await refreshAllAssets();
  res.json(results);
});

// Also support GET for easy testing
app.get('/refresh', async (req, res) => {
  console.log('[MANUAL] Refresh triggered via GET');
  const results = await refreshAllAssets();
  res.json(results);
});

// Status endpoint
let lastRefreshTime = null;
let lastRefreshResults = null;

app.get('/status', (req, res) => {
  res.json({
    isRefreshing,
    lastRefresh: lastRefreshTime,
    lastResults: lastRefreshResults,
    nextRefresh: lastRefreshTime
      ? new Date(new Date(lastRefreshTime).getTime() + REFRESH_INTERVAL_MS).toISOString()
      : 'Pending first run'
  });
});

// Get single asset (for debugging)
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

// Refresh single asset
app.post('/asset/:id/refresh', async (req, res) => {
  const { id } = req.params;

  const { data: asset, error } = await supabase
    .from('assets')
    .select('id, name, stockx_sku, size, base_price, price')
    .eq('id', id)
    .single();

  if (error || !asset) {
    return res.status(404).json({ error: 'Asset not found' });
  }

  if (!asset.stockx_sku) {
    return res.status(400).json({ error: 'Asset has no StockX SKU' });
  }

  try {
    const size = asset.size || '10';
    const liveData = await fetchLivePrice(asset.stockx_sku, size);
    const pricing = calculateBloomPrice(liveData.lowestAsk);

    await supabase
      .from('assets')
      .update({
        base_price: liveData.lowestAsk,
        price: pricing.bloomPrice,
        price_updated_at: new Date().toISOString(),
        last_price_update: new Date().toISOString()
      })
      .eq('id', asset.id);

    await supabase.from('price_history').insert({
      asset_id: asset.id,
      price: pricing.bloomPrice,
      source: 'manual_refresh',
      created_at: new Date().toISOString()
    });

    console.log(`[SINGLE] ${asset.name}: $${asset.base_price} -> $${liveData.lowestAsk}. Bloom: $${pricing.bloomPrice}`);

    res.json({
      name: asset.name,
      oldBase: asset.base_price,
      newBase: liveData.lowestAsk,
      bloomPrice: pricing.bloomPrice,
      pricing
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// AUTOMATED REFRESH LOOP
// ============================================
async function runScheduledRefresh() {
  console.log('\n[CRON] Scheduled refresh starting...');
  const results = await refreshAllAssets();
  lastRefreshTime = new Date().toISOString();
  lastRefreshResults = results;
}

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  const example = calculateBloomPrice(300);
  console.log('');
  console.log('='.repeat(60));
  console.log('  BLOOM PRICE WORKER - LIVE AUTOMATED ENGINE');
  console.log('='.repeat(60));
  console.log(`  Port: ${PORT}`);
  console.log(`  Refresh Interval: Every 10 minutes`);
  console.log(`  Formula: (Ask + 4.83% + 6% Tax + $14.95) × 1.015`);
  console.log(`  Example: $300 Ask -> $${example.bloomPrice} Bloom Price`);
  console.log('='.repeat(60));
  console.log('');

  // Run initial refresh on startup
  console.log('[STARTUP] Running initial price refresh...');
  runScheduledRefresh();

  // Schedule refresh every 10 minutes using cron
  // "*/10 * * * *" = every 10 minutes
  cron.schedule('*/10 * * * *', () => {
    runScheduledRefresh();
  });

  console.log('[CRON] Scheduled: Refresh every 10 minutes');
});
