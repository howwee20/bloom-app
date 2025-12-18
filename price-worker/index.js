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

// Michigan All-In Formula (EXACT - calibrated from real StockX checkout)
// For $302 base: processing=$14.59, tax=$19.00, shipping=$14.95, total=$350.54
function calculateAllIn(base) {
  const processing = Math.round(base * 0.04831 * 100) / 100;
  const tax = Math.round((base + processing) * 0.06 * 100) / 100;
  const shipping = 14.95;
  const total = Math.round((base + processing + tax + shipping) * 100) / 100;
  return { base, processing, tax, shipping, total };
}

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'Bloom Price Worker Running',
    formula: 'base + (base × 4.831%) + ((base + processing) × 6%) + $14.95',
    example: calculateAllIn(302)
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

  // Update asset
  const { error } = await supabase.from('assets').update({
    base_price: breakdown.base,
    price: breakdown.total,
    price_updated_at: new Date().toISOString(),
    last_price_update: new Date().toISOString()
  }).eq('id', asset_id);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Insert history
  await supabase.from('price_history').insert({
    asset_id: asset_id,
    price: breakdown.total,
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
        base_price: breakdown.base,
        price: breakdown.total,
        price_updated_at: new Date().toISOString(),
        last_price_update: new Date().toISOString()
      }).eq('id', asset.id);

      // Insert history
      await supabase.from('price_history').insert({
        asset_id: asset.id,
        price: breakdown.total,
        source: 'sneaks_api',
        created_at: new Date().toISOString()
      });

      results.success++;
      results.details.push({ name: asset.name, base: breakdown.base, total: breakdown.total });
      console.log(`✅ ${asset.name}: $${breakdown.base} → $${breakdown.total}`);

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

    // Update asset
    await supabase.from('assets').update({
      base_price: breakdown.base,
      price: breakdown.total,
      price_updated_at: new Date().toISOString(),
      last_price_update: new Date().toISOString()
    }).eq('id', asset.id);

    // Insert history
    await supabase.from('price_history').insert({
      asset_id: asset.id,
      price: breakdown.total,
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
  console.log(`🚀 Price Worker running on port ${PORT}`);
  console.log(`   Formula: base + (base × 4.831%) + ((base + processing) × 6%) + $14.95`);
});
