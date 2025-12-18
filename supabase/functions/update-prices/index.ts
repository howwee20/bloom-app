// supabase/functions/update-prices/index.ts
// Edge Function to fetch and update StockX prices with ALIVE Protocol fallback
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Hono } from 'https://deno.land/x/hono@v3.7.4/mod.ts'
import { cors } from 'https://esm.sh/hono@v3.7.4/cors'

const app = new Hono()
app.use('*', cors())

// Default config (used if database config unavailable)
// Calibrated from real StockX Michigan checkout screenshot
const DEFAULT_CONFIG = {
  processing_rate: 0.04831,      // 4.831% processing fee
  tax_rate: 0.06,                // 6% Michigan sales tax
  shipping_sneakers: 14.95,      // Flat shipping
  alive_fluctuation: 0.015,      // +/- 1.5%
};

interface PricingConfig {
  processing_rate: number;
  tax_rate: number;
  shipping_sneakers: number;
  alive_fluctuation: number;
}

interface PriceBreakdown {
  base: number;
  processingFee: number;
  salesTax: number;
  shippingFee: number;
  total: number;
}

// ALIVE Protocol: Synthetic Market Fluctuation
// When StockX rate-limits us, fluctuate price by +/- X% to keep the market feeling "alive"
function applySyntheticFluctuation(currentPrice: number, fluctuationRange: number): number {
  const fluctuation = (Math.random() * fluctuationRange * 2) - fluctuationRange;
  const newPrice = currentPrice * (1 + fluctuation);
  return Math.round(newPrice * 100) / 100;
}

// Calculate all-in buyer price from lowest ask (Michigan formula - ADDITIVE)
// Formula: total = base + processingFee + salesTax + shippingFee
// Where: salesTax = (base + processingFee) × taxRate
function calculateAllInPrice(base: number, config: PricingConfig): PriceBreakdown {
  const processingFee = Math.round(base * config.processing_rate * 100) / 100;
  const salesTax = Math.round((base + processingFee) * config.tax_rate * 100) / 100;
  const shippingFee = config.shipping_sneakers;
  const total = Math.round((base + processingFee + salesTax + shippingFee) * 100) / 100;

  return {
    base,
    processingFee,
    salesTax,
    shippingFee,
    total,
  };
}

// Fetch pricing config from database
async function getPricingConfig(supabase: any): Promise<PricingConfig> {
  try {
    const { data, error } = await supabase
      .from('pricing_config')
      .select('processing_rate, tax_rate, shipping_sneakers, alive_fluctuation')
      .single();

    if (error || !data) {
      console.log('Using default pricing config');
      return DEFAULT_CONFIG;
    }

    return {
      processing_rate: Number(data.processing_rate) || DEFAULT_CONFIG.processing_rate,
      tax_rate: Number(data.tax_rate) || DEFAULT_CONFIG.tax_rate,
      shipping_sneakers: Number(data.shipping_sneakers) || DEFAULT_CONFIG.shipping_sneakers,
      alive_fluctuation: Number(data.alive_fluctuation) || DEFAULT_CONFIG.alive_fluctuation,
    };
  } catch (e) {
    console.log('Error fetching config, using defaults:', e);
    return DEFAULT_CONFIG;
  }
}

interface PriceResult {
  asset_id: string;
  name?: string;
  previous_price: number;
  new_price: number;
  price_change: number;
  price_change_percent: number;
  source: 'stockx' | 'alive_protocol';
  breakdown?: PriceBreakdown;
  success: boolean;
  error?: string;
}

// Fetch base price from StockX for a specific product and size
// Returns just the lowest ask - all-in calculation happens later with config
async function fetchStockXBasePrice(slug: string, size: string): Promise<number | null> {
  try {
    // StockX product API - fetch market data
    const url = `https://stockx.com/api/products/${slug}?includes=market`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Check for rate limiting or blocking
    if (response.status === 403 || response.status === 429) {
      console.log(`StockX rate limited (${response.status}) for ${slug}`);
      return null;
    }

    if (!response.ok) {
      console.error(`StockX API error: ${response.status}`);
      return null;
    }

    const data = await response.json();

    // Navigate to the market data for the specific size
    const variants = data.Product?.children || {};

    // Find the variant matching our size
    for (const key in variants) {
      const variant = variants[key];
      if (variant.shoeSize === size || variant.traits?.size === size) {
        const market = variant.market || {};
        const lowestAsk = market.lowestAsk || market.lastSale || 0;
        if (lowestAsk > 0) return lowestAsk;
      }
    }

    // Fallback: use general market data if size-specific not found
    const generalMarket = data.Product?.market || {};
    const lowestAsk = generalMarket.lowestAsk || generalMarket.lastSale || 0;

    return lowestAsk > 0 ? lowestAsk : null;
  } catch (error) {
    // Timeout or network error - trigger ALIVE protocol
    console.error('Error fetching StockX price:', error.message || error);
    return null;
  }
}

// Alternative: Use StockX browse API (more reliable)
async function fetchStockXBasePriceBrowse(sku: string, size: string): Promise<number | null> {
  try {
    const url = `https://stockx.com/api/browse?_search=${encodeURIComponent(sku)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Check for rate limiting
    if (response.status === 403 || response.status === 429) {
      console.log(`StockX browse rate limited (${response.status}) for ${sku}`);
      return null;
    }

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const products = data.Products || [];

    // Find exact match by SKU
    const product = products.find((p: any) =>
      p.styleId === sku || p.traits?.some((t: any) => t.value === sku)
    );

    if (product?.market) {
      const lowestAsk = product.market.lowestAsk || product.market.lastSale || 0;
      return lowestAsk > 0 ? lowestAsk : null;
    }

    return null;
  } catch (error) {
    console.error('Error fetching from browse API:', error.message || error);
    return null;
  }
}

// Update price for a single asset
app.post('/single', async (c) => {
  try {
    const { asset_id } = await c.req.json();

    if (!asset_id) {
      return c.json({ error: 'asset_id is required' }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch pricing config from database
    const config = await getPricingConfig(supabaseAdmin);

    // Fetch asset details
    const { data: asset, error: assetError } = await supabaseAdmin
      .from('assets')
      .select('id, name, stockx_sku, stockx_slug, size, price')
      .eq('id', asset_id)
      .single();

    if (assetError || !asset) {
      return c.json({ error: 'Asset not found' }, 404);
    }

    const previousPrice = asset.price || 0;
    let newPrice = previousPrice;
    let source: 'stockx' | 'alive_protocol' = 'alive_protocol';
    let basePrice: number | null = null;
    let breakdown: PriceBreakdown | undefined;

    // Try to fetch real price from StockX
    if (asset.stockx_slug) {
      basePrice = await fetchStockXBasePrice(asset.stockx_slug, asset.size || '');
    }

    if (basePrice === null && asset.stockx_sku) {
      basePrice = await fetchStockXBasePriceBrowse(asset.stockx_sku, asset.size || '');
    }

    if (basePrice !== null) {
      // Real price fetched - calculate all-in with correct formula
      breakdown = calculateAllInPrice(basePrice, config);
      newPrice = breakdown.total;
      source = 'stockx';
    } else {
      // ALIVE Protocol: Apply synthetic fluctuation
      console.log(`ALIVE Protocol activated for ${asset.name || asset.id}`);
      newPrice = applySyntheticFluctuation(previousPrice, config.alive_fluctuation);
      source = 'alive_protocol';
    }

    // Insert into price_history
    await supabaseAdmin.from('price_history').insert({
      asset_id: asset.id,
      price: newPrice,
      fees_estimate: breakdown ? (breakdown.processingFee + breakdown.salesTax + breakdown.shippingFee) : 0,
      source: source,
    });

    // Update asset current price
    await supabaseAdmin
      .from('assets')
      .update({
        price: newPrice,
        last_price_update: new Date().toISOString(),
      })
      .eq('id', asset.id);

    const priceChange = newPrice - previousPrice;
    const priceChangePercent = previousPrice > 0 ? (priceChange / previousPrice) * 100 : 0;

    const result: PriceResult = {
      asset_id: asset.id,
      name: asset.name,
      previous_price: previousPrice,
      new_price: newPrice,
      price_change: Math.round(priceChange * 100) / 100,
      price_change_percent: Math.round(priceChangePercent * 100) / 100,
      source: source,
      breakdown: breakdown,
      success: true,
    };

    return c.json(result);
  } catch (error) {
    console.error('Error updating single price:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Update prices for all assets with StockX SKU
app.post('/all', async (c) => {
  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch pricing config from database
    const config = await getPricingConfig(supabaseAdmin);

    // Fetch all assets with StockX info
    const { data: assets, error: assetsError } = await supabaseAdmin
      .from('assets')
      .select('id, name, stockx_sku, stockx_slug, size, price')
      .or('stockx_sku.not.is.null,stockx_slug.not.is.null');

    if (assetsError) {
      return c.json({ error: assetsError.message }, 500);
    }

    const results: PriceResult[] = [];
    let stockxSuccesses = 0;
    let aliveProtocolActivations = 0;

    for (const asset of assets || []) {
      const previousPrice = asset.price || 0;
      let newPrice = previousPrice;
      let source: 'stockx' | 'alive_protocol' = 'alive_protocol';
      let basePrice: number | null = null;
      let breakdown: PriceBreakdown | undefined;

      // Try to fetch real price from StockX
      if (asset.stockx_slug) {
        basePrice = await fetchStockXBasePrice(asset.stockx_slug, asset.size || '');
      }

      if (basePrice === null && asset.stockx_sku) {
        basePrice = await fetchStockXBasePriceBrowse(asset.stockx_sku, asset.size || '');
      }

      if (basePrice !== null) {
        // Real price fetched - calculate all-in with correct formula
        breakdown = calculateAllInPrice(basePrice, config);
        newPrice = breakdown.total;
        source = 'stockx';
        stockxSuccesses++;
      } else {
        // ALIVE Protocol: Apply synthetic fluctuation
        newPrice = applySyntheticFluctuation(previousPrice, config.alive_fluctuation);
        source = 'alive_protocol';
        aliveProtocolActivations++;
      }

      // Insert into price_history
      await supabaseAdmin.from('price_history').insert({
        asset_id: asset.id,
        price: newPrice,
        fees_estimate: breakdown ? (breakdown.processingFee + breakdown.salesTax + breakdown.shippingFee) : 0,
        source: source,
      });

      // Update asset current price
      await supabaseAdmin
        .from('assets')
        .update({
          price: newPrice,
          last_price_update: new Date().toISOString(),
        })
        .eq('id', asset.id);

      const priceChange = newPrice - previousPrice;
      const priceChangePercent = previousPrice > 0 ? (priceChange / previousPrice) * 100 : 0;

      results.push({
        asset_id: asset.id,
        name: asset.name,
        previous_price: previousPrice,
        new_price: newPrice,
        price_change: Math.round(priceChange * 100) / 100,
        price_change_percent: Math.round(priceChangePercent * 100) / 100,
        source: source,
        breakdown: breakdown,
        success: true,
      });

      // Rate limit: wait 500ms between requests to be nice to StockX
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return c.json({
      message: 'Price update complete',
      total: results.length,
      stockx_fetched: stockxSuccesses,
      alive_protocol_used: aliveProtocolActivations,
      alive_protocol_explanation: `When StockX is unavailable, prices fluctuate +/- ${config.alive_fluctuation * 100}% to simulate market activity`,
      pricing_config: {
        processing_rate: `${config.processing_rate * 100}%`,
        tax_rate: `${config.tax_rate * 100}%`,
        shipping: config.shipping_sneakers,
      },
      results,
    });
  } catch (error) {
    console.error('Error updating all prices:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Health check / manual trigger endpoint
app.get('/', async (c) => {
  // Calculate example to show in response
  const exampleBase = 302;
  const exampleBreakdown = calculateAllInPrice(exampleBase, DEFAULT_CONFIG);

  return c.json({
    status: 'ok',
    message: 'Price update function ready with ALIVE Protocol',
    pricing_formula: {
      description: 'All-in Buyer Price - Michigan (what you would pay at checkout)',
      formula: 'total = base + processingFee + salesTax + shippingFee',
      details: {
        processingFee: 'base × 4.831%',
        salesTax: '(base + processingFee) × 6%',
        shippingFee: '$14.95',
      },
      example: {
        base: exampleBase,
        processingFee: exampleBreakdown.processingFee,
        salesTax: exampleBreakdown.salesTax,
        shippingFee: exampleBreakdown.shippingFee,
        total: exampleBreakdown.total,
        note: 'Calibrated from real StockX Michigan checkout screenshot',
      },
    },
    alive_protocol: {
      description: 'Synthetic market fluctuation when StockX is unavailable',
      trigger: 'HTTP 403, 429, timeout, or network error from StockX',
      behavior: `Price fluctuates randomly by +/- ${DEFAULT_CONFIG.alive_fluctuation * 100}%`,
      purpose: 'Keeps the market feeling alive and P&L moving even when rate-limited',
    },
    endpoints: {
      'POST /single': 'Update single asset price (body: { asset_id })',
      'POST /all': 'Update all assets with StockX SKU',
    }
  });
});

export default app.fetch
