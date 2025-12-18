require('dotenv').config();
const express = require('express');
const SneaksAPI = require('sneaks-api');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

const sneaks = new SneaksAPI();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Pricing Constants (Calibrated from real StockX checkout - Michigan)
const STOCKX_PROCESSING_RATE = 0.0483;  // 4.83% (Derived from $14.49/$300)
const MI_TAX_RATE = 0.06;               // 6% Michigan Sales Tax
const STOCKX_SHIPPING = 14.95;          // Exact Flat Rate
const VOLATILITY_BUFFER = 1.015;        // 1.5% safety margin for API lag

// Calculate Bloom Price from StockX lowest ask
// Example: Ask: $300 | Landed: $348.31 | Bloom Price: $353.53 (Buffer: 1.5%)
function calculateAllIn(lowestAsk) {
  // Step 1: Calculate the Raw StockX Cost (The "Break Even" point)
  const processingFee = Math.round(lowestAsk * STOCKX_PROCESSING_RATE * 100) / 100;
  const taxBase = lowestAsk + processingFee;
  const estimatedTax = Math.round(taxBase * MI_TAX_RATE * 100) / 100;
  const landedCost = Math.round((lowestAsk + processingFee + estimatedTax + STOCKX_SHIPPING) * 100) / 100;

  // Step 2: Add Safety Buffer (Final Customer Price)
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

// Health check
app.get('/', (req, res) => {
  const example = calculateAllIn(300);
  res.json({
    status: 'Bloom Price Worker Running',
    formula: '(Ask + Processing + Tax + Shipping) × 1.015 Buffer',
    example,
    verification: `Ask: $${example.lowestAsk} | Landed: $${example.landedCost} | Bloom Price: $${example.bloomPrice} (Buffer: ${example.buffer})`
  });
});

// ALIVE Protocol: Synthetic fluctuation when API is blocked
function applyAliveFluctuation(currentPrice) {
  const fluctuation = (Math.random() * 0.03) - 0.015; // +/- 1.5%
  return Math.round(currentPrice * (1 + fluctuation) * 100) / 100;
}

// Get single price
app.get('/price/:sku/:size', (req, res) => {
  const { sku, size } = req.params;

  sneaks.getProductPrices(sku, (err, product) => {
    if (err || !product) {
      console.error('Error fetching:', sku, err?.message || 'Unknown error');
      return res.status(500).json({
        error: 'Failed to fetch price - API blocked',
        suggestion: 'Use /manual-update endpoint or ALIVE protocol'
      });
    }

    // Try multiple size formats
    const sizeFormats = [size, `${size}`, `US ${size}`, `${size} US`];
    let basePrice = null;

    for (const fmt of sizeFormats) {
      basePrice = product.resellPrices?.stockX?.[fmt];
      if (basePrice) break;
    }

    if (!basePrice) {
      // Log available sizes for debugging
      console.log('Available sizes for', sku, ':', Object.keys(product.resellPrices?.stockX || {}));
      return res.status(404).json({
        error: `Size ${size} not found for ${sku}`,
        availableSizes: Object.keys(product.resellPrices?.stockX || {})
      });
    }

    const breakdown = calculateAllIn(basePrice);
    console.log(`💰 ${sku} size ${size}: Ask: $${breakdown.lowestAsk} | Landed: $${breakdown.landedCost} | Bloom Price: $${breakdown.bloomPrice} (Buffer: ${breakdown.buffer})`);
    res.json({
      sku,
      size,
      ...breakdown,
      product: product.shoeName,
      source: 'sneaks_api',
      fetchedAt: new Date().toISOString()
    });
  });
});

// Manual price update (for when API is blocked)
app.post('/manual-update', async (req, res) => {
  const { asset_id, base_price } = req.body;

  if (!asset_id || !base_price) {
    return res.status(400).json({ error: 'asset_id and base_price required' });
  }

  const breakdown = calculateAllIn(base_price);
  console.log(`📝 Manual update ${asset_id}: Ask: $${breakdown.lowestAsk} | Landed: $${breakdown.landedCost} | Bloom Price: $${breakdown.bloomPrice} (Buffer: ${breakdown.buffer})`);

  // Update asset
  const { error } = await supabase.from('assets').update({
    base_price: breakdown.lowestAsk,
    price: breakdown.bloomPrice,
    price_updated_at: new Date().toISOString(),
    last_price_update: new Date().toISOString()
  }).eq('id', asset_id);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Insert history
  await supabase.from('price_history').insert({
    asset_id: asset_id,
    price: breakdown.bloomPrice,
    source: 'manual',
    created_at: new Date().toISOString()
  });

  res.json({
    asset_id,
    ...breakdown,
    source: 'manual',
    updatedAt: new Date().toISOString()
  });
});

// ALIVE Protocol refresh (synthetic fluctuation when API blocked)
app.post('/alive-refresh', async (req, res) => {
  if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('ALIVE Protocol: Applying synthetic fluctuation...');

  const { data: assets, error } = await supabase
    .from('assets')
    .select('id, name, price')
    .eq('curated', true);

  if (error) {
    return res.status(500).json({ error: 'Database error' });
  }

  const results = { updated: 0, details: [] };

  for (const asset of assets) {
    const newPrice = applyAliveFluctuation(asset.price);

    await supabase.from('assets').update({
      price: newPrice,
      price_updated_at: new Date().toISOString(),
      last_price_update: new Date().toISOString()
    }).eq('id', asset.id);

    await supabase.from('price_history').insert({
      asset_id: asset.id,
      price: newPrice,
      source: 'alive_protocol',
      created_at: new Date().toISOString()
    });

    const change = newPrice - asset.price;
    results.updated++;
    results.details.push({
      name: asset.name,
      oldPrice: asset.price,
      newPrice: newPrice,
      change: change >= 0 ? `+${change.toFixed(2)}` : change.toFixed(2)
    });
  }

  console.log(`ALIVE Protocol: Updated ${results.updated} assets`);
  res.json(results);
});

// Refresh all curated assets
app.post('/refresh-all', async (req, res) => {
  // Check secret
  if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('Starting refresh...');

  const { data: assets, error } = await supabase
    .from('assets')
    .select('id, name, stockx_sku, size')
    .eq('curated', true);

  if (error) {
    console.error('DB Error:', error);
    return res.status(500).json({ error: 'Database error' });
  }

  console.log(`Found ${assets.length} curated assets`);
  const results = { success: 0, failed: 0, details: [] };

  for (const asset of assets) {
    const size = asset.size || '10';

    try {
      const price = await new Promise((resolve, reject) => {
        sneaks.getProductPrices(asset.stockx_sku, (err, product) => {
          if (err) return reject(err);
          const basePrice = product?.resellPrices?.stockX?.[size];
          if (!basePrice) return reject(new Error('No price found'));
          resolve(basePrice);
        });
      });

      const breakdown = calculateAllIn(price);

      // Update asset
      await supabase.from('assets').update({
        base_price: breakdown.lowestAsk,
        price: breakdown.bloomPrice,
        price_updated_at: new Date().toISOString(),
        last_price_update: new Date().toISOString()
      }).eq('id', asset.id);

      // Insert history
      await supabase.from('price_history').insert({
        asset_id: asset.id,
        price: breakdown.bloomPrice,
        source: 'sneaks_api',
        created_at: new Date().toISOString()
      });

      results.success++;
      results.details.push({ name: asset.name, lowestAsk: breakdown.lowestAsk, landedCost: breakdown.landedCost, bloomPrice: breakdown.bloomPrice });
      console.log(`✅ ${asset.name}: Ask: $${breakdown.lowestAsk} | Landed: $${breakdown.landedCost} | Bloom Price: $${breakdown.bloomPrice} (Buffer: ${breakdown.buffer})`);

      // Wait 3 seconds between requests (rate limiting)
      await new Promise(r => setTimeout(r, 3000));

    } catch (error) {
      results.failed++;
      results.details.push({ name: asset.name, error: error.message });
      console.log(`❌ ${asset.name}: ${error.message}`);
    }
  }

  console.log(`Done: ${results.success} success, ${results.failed} failed`);
  res.json(results);
});

// Refresh single asset
app.post('/refresh/:id', async (req, res) => {
  const { id } = req.params;

  const { data: asset, error } = await supabase
    .from('assets')
    .select('id, name, stockx_sku, size')
    .eq('id', id)
    .single();

  if (error || !asset) {
    return res.status(404).json({ error: 'Asset not found' });
  }

  const size = asset.size || '10';

  try {
    const price = await new Promise((resolve, reject) => {
      sneaks.getProductPrices(asset.stockx_sku, (err, product) => {
        if (err) return reject(err);
        const basePrice = product?.resellPrices?.stockX?.[size];
        if (!basePrice) return reject(new Error('No price found'));
        resolve(basePrice);
      });
    });

    const breakdown = calculateAllIn(price);
    console.log(`🔄 ${asset.name}: Ask: $${breakdown.lowestAsk} | Landed: $${breakdown.landedCost} | Bloom Price: $${breakdown.bloomPrice} (Buffer: ${breakdown.buffer})`);

    // Update asset
    await supabase.from('assets').update({
      base_price: breakdown.lowestAsk,
      price: breakdown.bloomPrice,
      price_updated_at: new Date().toISOString(),
      last_price_update: new Date().toISOString()
    }).eq('id', asset.id);

    // Insert history
    await supabase.from('price_history').insert({
      asset_id: asset.id,
      price: breakdown.bloomPrice,
      source: 'sneaks_api',
      created_at: new Date().toISOString()
    });

    res.json({
      name: asset.name,
      ...breakdown,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  const example = calculateAllIn(300);
  console.log(`🚀 Price Worker running on port ${PORT}`);
  console.log(`   Formula: (Ask + Processing + Tax + Shipping) × 1.015 Buffer`);
  console.log(`   Example: Ask: $${example.lowestAsk} | Landed: $${example.landedCost} | Bloom Price: $${example.bloomPrice} (Buffer: ${example.buffer})`);
});
