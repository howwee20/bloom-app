// supabase/functions/update-prices/index.ts
// Edge Function to fetch and update StockX prices (real data only)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Hono } from 'https://deno.land/x/hono@v3.7.4/mod.ts'
import { cors } from 'https://esm.sh/hono@v3.7.4/cors'

const app = new Hono()
app.use('*', cors())

// Default config (used if database config unavailable)
// Reverse-engineered from ACTUAL StockX checkout prices (Jan 2026):
//   Black Cat $282 → $310.57 checkout
//   Samba $112 → $133.90 checkout
// Formula: All-In = Base × 1.039 + $17.50
const DEFAULT_CONFIG = {
  flat_fee: 17.50,              // Flat fee (shipping + base processing)
  variable_rate: 0.039,         // 3.9% variable (processing + tax)
};

interface PricingConfig {
  flat_fee: number;
  variable_rate: number;
}

const MAX_RUNTIME_MS = 25000;
const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 500;
const MAX_CONCURRENCY = 3;
const CHECK_MARGIN_MS = 1500;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const shouldStop = (deadlineMs: number) => Date.now() >= deadlineMs - CHECK_MARGIN_MS;

interface PriceBreakdown {
  base: number;
  variableFee: number;
  flatFee: number;
  total: number;
}

// Calculate all-in buyer price from lowest ask
// Formula: All-In = Base × 1.039 + $17.50 (matches actual StockX checkout)
function calculateAllInPrice(base: number, config: PricingConfig): PriceBreakdown {
  const variableFee = Math.round(base * config.variable_rate * 100) / 100;
  const flatFee = config.flat_fee;
  const total = Math.round((base + variableFee + flatFee) * 100) / 100;

  return {
    base,
    variableFee,
    flatFee,
    total,
  };
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

// Fetch pricing config from database
async function getPricingConfig(supabase: any): Promise<PricingConfig> {
  try {
    const { data, error } = await supabase
      .from('pricing_config')
      .select('flat_fee, variable_rate')
      .single();

    if (error || !data) {
      console.log('Using default pricing config');
      return DEFAULT_CONFIG;
    }

    return {
      flat_fee: Number(data.flat_fee) || DEFAULT_CONFIG.flat_fee,
      variable_rate: Number(data.variable_rate) || DEFAULT_CONFIG.variable_rate,
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
  source: 'stockx' | 'stockx_unavailable';
  breakdown?: PriceBreakdown;
  success: boolean;
  error?: string;
}

type UpdateOutcome = PriceResult & {
  changed: boolean;
  checked_at: string;
};

// Fetch base price from StockX for a specific product and size
// Returns just the lowest ask - all-in calculation happens later with config
async function fetchStockXBasePrice(slug: string, size: string): Promise<number | null> {
  try {
    // StockX product API - fetch market data
    const url = `https://stockx.com/api/products/${slug}?includes=market`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

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
    // Timeout or network error - treat as unavailable
    console.error('Error fetching StockX price:', error.message || error);
    return null;
  }
}

// Alternative: Use StockX browse API (more reliable)
async function fetchStockXBasePriceBrowse(sku: string, size: string): Promise<number | null> {
  try {
    const url = `https://stockx.com/api/browse?_search=${encodeURIComponent(sku)}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

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

async function fetchBasePriceWithRetry(
  asset: { stockx_slug: string | null; stockx_sku: string | null; size: string | null },
  deadlineMs: number
): Promise<number | null> {
  let attempt = 0;
  let backoffMs = BASE_BACKOFF_MS;

  while (attempt <= MAX_RETRIES && !shouldStop(deadlineMs)) {
    let basePrice: number | null = null;

    if (asset.stockx_slug) {
      basePrice = await fetchStockXBasePrice(asset.stockx_slug, asset.size || '');
    }

    if (basePrice === null && asset.stockx_sku) {
      basePrice = await fetchStockXBasePriceBrowse(asset.stockx_sku, asset.size || '');
    }

    if (basePrice !== null) {
      return basePrice;
    }

    attempt += 1;
    if (attempt <= MAX_RETRIES && !shouldStop(deadlineMs)) {
      await sleep(backoffMs);
      backoffMs *= 2;
    }
  }

  return null;
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
    const deadlineMs = Date.now() + MAX_RUNTIME_MS;
    const result = await updateAssetPrice(asset, supabaseAdmin, config, deadlineMs);

    return c.json(result);
  } catch (error) {
    console.error('Error updating single price:', error);
    return c.json({ error: error.message }, 500);
  }
});

type CursorPayload = {
  phase: 'nulls' | 'checked';
  id: string;
  lastPriceCheckedAt: string | null;
  runStartedAt: string;
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 25;
const MIN_LIMIT = 10;
const MAX_FETCH = 75;

const encodeCursor = (payload: CursorPayload) => btoa(JSON.stringify(payload));
const decodeCursor = (cursor?: string): CursorPayload | null => {
  if (!cursor) return null;
  try {
    return JSON.parse(atob(cursor));
  } catch {
    return null;
  }
};

const isAssetActive = (asset: any, activeSkus: Set<string>) => {
  return Boolean(asset.owner_id) || (asset.stockx_sku && activeSkus.has(asset.stockx_sku));
};

const fetchActiveSkus = async (supabaseAdmin: any) => {
  const { data } = await supabaseAdmin
    .from('tokens')
    .select('sku, match_status');
  const skus = (data || [])
    .filter((row: any) => row.match_status !== 'pending')
    .map((row: any) => row.sku)
    .filter((sku: string) => Boolean(sku));
  return new Set(skus);
};

const updateAssetPrice = async (
  asset: any,
  supabaseAdmin: any,
  config: PricingConfig,
  deadlineMs: number
): Promise<UpdateOutcome> => {
  const previousPrice = asset.price || 0;
  let newPrice = previousPrice;
  let source: 'stockx' | 'stockx_unavailable' = 'stockx_unavailable';
  let breakdown: PriceBreakdown | undefined;
  const checkedAt = new Date().toISOString();

  const basePrice = await fetchBasePriceWithRetry(asset, deadlineMs);

  if (basePrice !== null) {
    breakdown = calculateAllInPrice(basePrice, config);
    newPrice = breakdown.total;
    source = 'stockx';

    const roundedPrevious = Math.round(previousPrice * 100) / 100;
    const roundedNew = Math.round(newPrice * 100) / 100;
    const priceChanged = roundedNew !== roundedPrevious;

    if (priceChanged) {
      await supabaseAdmin.from('price_history').insert({
        asset_id: asset.id,
        price: newPrice,
        fees_estimate: breakdown ? (breakdown.variableFee + breakdown.flatFee) : 0,
        source: source,
      });

      await supabaseAdmin
        .from('assets')
        .update({
          price: newPrice,
          last_price_update: checkedAt,
          last_price_updated_at: checkedAt,
          last_price_checked_at: checkedAt,
        })
        .eq('id', asset.id);
    } else {
      await supabaseAdmin
        .from('assets')
        .update({
          last_price_checked_at: checkedAt,
        })
        .eq('id', asset.id);
    }
  } else {
    await supabaseAdmin
      .from('assets')
      .update({
        last_price_checked_at: checkedAt,
      })
      .eq('id', asset.id);
  }

  const priceChange = newPrice - previousPrice;
  const priceChangePercent = previousPrice > 0 ? (priceChange / previousPrice) * 100 : 0;
  const changed = source === 'stockx' && Math.round(newPrice * 100) / 100 !== Math.round(previousPrice * 100) / 100;

  return {
    asset_id: asset.id,
    name: asset.name,
    previous_price: previousPrice,
    new_price: newPrice,
    price_change: Math.round(priceChange * 100) / 100,
    price_change_percent: Math.round(priceChangePercent * 100) / 100,
    source,
    breakdown,
    success: source === 'stockx',
    error: source === 'stockx' ? undefined : 'StockX unavailable',
    changed,
    checked_at: checkedAt,
  };
};

// Update prices for active portfolio assets
app.post('/all', async (c) => {
  const start = Date.now();
  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const requestBody = await c.req.json().catch(() => ({}));
    const requestedLimit = Number(requestBody.limit);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(MIN_LIMIT, Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : DEFAULT_LIMIT)
    );
    const cursorPayload = decodeCursor(requestBody.cursor);
    const runStartedAt = cursorPayload?.runStartedAt || new Date().toISOString();
    const phase = cursorPayload?.phase || 'nulls';

    const config = await getPricingConfig(supabaseAdmin);
    const activeSkus = await fetchActiveSkus(supabaseAdmin);
    const results: UpdateOutcome[] = [];
    let processedCount = 0;
    let updatedCount = 0;
    let failedCount = 0;
    const deadlineMs = start + MAX_RUNTIME_MS;

    const baseSelect = 'id, name, stockx_sku, stockx_slug, size, price, owner_id, last_price_checked_at';

    const fetchLimit = Math.min(limit * 3, MAX_FETCH);
    let assets: any[] = [];
    let nextCursor: string | null = null;
    let stockxSuccesses = 0;

    if (phase === 'nulls') {
      let query = supabaseAdmin
        .from('assets')
        .select(baseSelect)
        .or('stockx_sku.not.is.null,stockx_slug.not.is.null')
        .is('last_price_checked_at', null)
        .order('id', { ascending: true })
        .limit(fetchLimit);

      if (cursorPayload?.id) {
        query = query.gt('id', cursorPayload.id);
      }

      const { data: nullsData } = await query;
      assets = (nullsData || [])
        .filter((asset: any) => isAssetActive(asset, activeSkus))
        .slice(0, limit)
        .map((asset: any) => ({ ...asset, __phase: 'nulls' }));

      if (assets.length === limit) {
        const last = assets[assets.length - 1];
        nextCursor = encodeCursor({
          phase: 'nulls',
          id: last.id,
          lastPriceCheckedAt: null,
          runStartedAt,
        });
      }
    }

    if (assets.length < limit) {
      const remaining = limit - assets.length;
      let query = supabaseAdmin
        .from('assets')
        .select(baseSelect)
        .or('stockx_sku.not.is.null,stockx_slug.not.is.null')
        .not('last_price_checked_at', 'is', null)
        .lte('last_price_checked_at', runStartedAt)
        .order('last_price_checked_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(fetchLimit);

      if (cursorPayload?.phase === 'checked' && cursorPayload.lastPriceCheckedAt) {
        query = query.or(
          `last_price_checked_at.gt.${cursorPayload.lastPriceCheckedAt},and(last_price_checked_at.eq.${cursorPayload.lastPriceCheckedAt},id.gt.${cursorPayload.id})`
        );
      }

      const { data: checkedData } = await query;
      const selected = (checkedData || [])
        .filter((asset: any) => isAssetActive(asset, activeSkus))
        .slice(0, remaining)
        .map((asset: any) => ({ ...asset, __phase: 'checked' }));

      assets = assets.concat(selected);

      if (selected.length === remaining && selected.length > 0) {
        const last = assets[assets.length - 1];
        nextCursor = encodeCursor({
          phase: 'checked',
          id: last.id,
          lastPriceCheckedAt: last.last_price_checked_at,
          runStartedAt,
        });
      }
    }

    const concurrency = Math.min(MAX_CONCURRENCY, assets.length);
    let index = 0;
    let maxProcessedIndex = -1;

    const workers = Array.from({ length: concurrency }).map(async () => {
      while (index < assets.length && !shouldStop(deadlineMs)) {
        const assetIndex = index++;
        const asset = assets[assetIndex];
        const result = await updateAssetPrice(asset, supabaseAdmin, config, deadlineMs);
        results.push(result);
        processedCount += 1;
        if (result.source === 'stockx') {
          stockxSuccesses++;
        }
        if (result.changed) {
          updatedCount += 1;
        }
        if (!result.success) {
          failedCount += 1;
        }
        if (assetIndex > maxProcessedIndex) {
          maxProcessedIndex = assetIndex;
        }
        await sleep(250);
      }
    });

    await Promise.all(workers);

    if (maxProcessedIndex >= 0 && maxProcessedIndex < assets.length - 1) {
      const last = assets[maxProcessedIndex];
      nextCursor = encodeCursor({
        phase: last.__phase,
        id: last.id,
        lastPriceCheckedAt: last.last_price_checked_at || null,
        runStartedAt,
      });
    }

    const { data: tokenSyncResult, error: tokenSyncError } = await supabaseAdmin.rpc('sync_token_prices_from_assets');
    const tokensSynced = tokenSyncResult || 0;
    if (tokenSyncError) {
      console.error('Token sync error:', tokenSyncError);
    }

    return c.json({
      ok: true,
      processed: processedCount,
      updated: updatedCount,
      failed: failedCount,
      tokens_synced: tokensSynced,
      stockx_fetched: stockxSuccesses,
      durationMs: Date.now() - start,
      nextCursor,
      pricing_config: {
        variable_rate: `${config.variable_rate * 100}%`,
        flat_fee: `$${config.flat_fee}`,
        formula: 'base × 1.039 + $17.50',
      },
      results,
    });
  } catch (error) {
    console.error('Error updating all prices:', error);
    return c.json({ ok: false, error: error.message, durationMs: Date.now() - start }, 500);
  }
});

// Health check / manual trigger endpoint
app.get('/', async (c) => {
  const exampleBlackCat = calculateAllInPrice(282, DEFAULT_CONFIG);
  const exampleSamba = calculateAllInPrice(112, DEFAULT_CONFIG);

  return c.json({
    status: 'ok',
    message: 'Price update function ready',
    pricing_formula: {
      description: 'All-in Buyer Price (matches actual StockX checkout)',
      formula: 'total = base × 1.039 + $17.50',
      details: {
        variableFee: 'base × 3.9%',
        flatFee: '$17.50',
      },
      examples: [
        {
          item: 'Black Cat ($282 base)',
          calculated: exampleBlackCat.total,
          stockx_actual: 310.57,
        },
        {
          item: 'Samba ($112 base)',
          calculated: exampleSamba.total,
          stockx_actual: 133.90,
        },
      ],
      note: 'Reverse-engineered from actual StockX checkout (Jan 2026)',
    },
    endpoints: {
      'POST /single': 'Update single asset price (body: { asset_id })',
      'POST /all': 'Update active assets (body: { limit?, cursor? })',
    }
  });
});

export default app.fetch
