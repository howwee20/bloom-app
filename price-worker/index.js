require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { fetchPrice } = require('./lib/stockx');
const { calculateBloomPrice, PROCESSING_RATE, SHIPPING, MI_TAX_RATE } = require('./lib/pricing');

const app = express();
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ============================================
// CONFIGURATION
// ============================================
const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const API_DELAY_MS = 1200;                   // 1.2s between calls (StockX: 1/sec limit)

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
  console.log('[SOURCE] StockX Official API');
  console.log('[FORMULA] Michigan All-In (Base + 3% + $14.95 + 6% Tax)');
  console.log('='.repeat(60));

  try {
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

    console.log(`[INFO] Processing ${allAssets.length} assets\n`);

    const results = {
      success: true,
      updated: 0,
      failed: 0,
      details: []
    };

    for (const asset of allAssets) {
      const size = asset.size || '10';
      const oldPrice = asset.price || 0;

      try {
        // Fetch live price from StockX
        const liveData = await fetchPrice(asset.stockx_sku, size);
        const newAsk = liveData.lowestAsk;
        const newBid = liveData.highestBid;

        // Calculate Bloom price (Michigan All-In)
        const pricing = calculateBloomPrice(newAsk);
        const newPrice = pricing.bloomPrice;

        // Update database
        await supabase
          .from('assets')
          .update({
            base_price: newAsk,
            price: newPrice,
            highest_bid: newBid,
            price_updated_at: new Date().toISOString(),
            last_price_update: new Date().toISOString()
          })
          .eq('id', asset.id);

        // Log price history
        await supabase.from('price_history').insert({
          asset_id: asset.id,
          price: newPrice,
          source: 'stockx',
          created_at: new Date().toISOString()
        });

        // Update token current_values for this SKU
        await supabase
          .from('tokens')
          .update({
            current_value: newPrice,
            value_updated_at: new Date().toISOString()
          })
          .eq('sku', asset.stockx_sku);

        const diff = newPrice - oldPrice;
        const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '=';
        console.log(`✓ ${asset.stockx_sku}: $${oldPrice.toFixed(2)} → $${newPrice.toFixed(2)} ${arrow}`);

        results.updated++;
        results.details.push({
          sku: asset.stockx_sku,
          name: asset.name,
          oldPrice,
          newPrice,
          ask: newAsk,
          fees: pricing.totalFees
        });

        await new Promise(r => setTimeout(r, API_DELAY_MS));

      } catch (err) {
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

    return results;

  } finally {
    isRefreshing = false;
  }
}

// ============================================
// EXPRESS ENDPOINTS
// ============================================

app.get('/', (req, res) => {
  const example = calculateBloomPrice(180);
  res.json({
    status: 'Bloom Price Worker',
    source: 'StockX Official API',
    formula: 'Michigan All-In: Base + 3% Processing + $14.95 Shipping + 6% Tax',
    example: {
      stockxAsk: '$180.00',
      processing: `$${example.processingFee} (3%)`,
      shipping: `$${example.shipping}`,
      michiganTax: `$${example.michiganTax} (6%)`,
      bloomPrice: `$${example.bloomPrice}`
    },
    endpoints: {
      'GET /refresh': 'Refresh all prices from StockX',
      'GET /status': 'Check worker status'
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

app.get('/status', (req, res) => {
  res.json({
    isRefreshing,
    lastRefresh: lastRefreshTime,
    lastResults: lastRefreshResults,
    formula: {
      processing: `${PROCESSING_RATE * 100}%`,
      shipping: `$${SHIPPING}`,
      tax: `${MI_TAX_RATE * 100}%`
    }
  });
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
// START SERVER
// ============================================
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  const example = calculateBloomPrice(180);
  console.log('');
  console.log('='.repeat(60));
  console.log('  BLOOM PRICE WORKER');
  console.log('='.repeat(60));
  console.log(`  Port: ${PORT}`);
  console.log(`  Source: StockX Official API`);
  console.log(`  Formula: Michigan All-In (Zero Margin)`);
  console.log(`    - Processing: 3%`);
  console.log(`    - Shipping: $14.95`);
  console.log(`    - MI Tax: 6%`);
  console.log(`  Example: $180 Ask → $${example.bloomPrice} Bloom`);
  console.log('='.repeat(60));
  console.log('');
});
