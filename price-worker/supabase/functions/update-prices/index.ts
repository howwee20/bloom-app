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

// ============================================
// AUTHENTICATED STOCKX API (Official V2)
// ============================================
let cachedAccessToken: string | null = null;
let tokenExpiry = 0;

async function getStockXAccessToken(): Promise<string> {
  // Return cached token if still valid (with 5 min buffer)
  if (cachedAccessToken && Date.now() < tokenExpiry - 300000) {
    return cachedAccessToken;
  }

  console.log('[STOCKX] Refreshing access token...');

  const clientId = Deno.env.get('STOCKX_CLIENT_ID');
  const clientSecret = Deno.env.get('STOCKX_CLIENT_SECRET');
  const refreshToken = Deno.env.get('STOCKX_REFRESH_TOKEN');

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('StockX API credentials not configured');
  }

  const response = await fetch('https://accounts.stockx.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`StockX token refresh failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  cachedAccessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000);

  console.log('[STOCKX] Token refreshed successfully');
  return cachedAccessToken;
}

async function fetchStockXAuthenticatedPrice(sku: string, size: string): Promise<number | null> {
  try {
    const token = await getStockXAccessToken();
    const apiKey = Deno.env.get('STOCKX_API_KEY');

    if (!apiKey) {
      console.log('[STOCKX] API key not configured');
      return null;
    }

    // Step 1: Search for product by SKU
    const searchRes = await fetch(
      `https://api.stockx.com/v2/catalog/search?query=${encodeURIComponent(sku)}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-api-key': apiKey,
        },
      }
    );

    if (!searchRes.ok) {
      console.log(`[STOCKX] Search failed: ${searchRes.status}`);
      return null;
    }

    const searchData = await searchRes.json();
    if (!searchData.products?.length) {
      console.log(`[STOCKX] No products found for SKU: ${sku}`);
      return null;
    }

    const product = searchData.products[0];
    const productId = product.productId;
    console.log(`[STOCKX] Found: ${product.title || sku}`);

    // Step 2: Get variants to find target size
    const variantsRes = await fetch(
      `https://api.stockx.com/v2/catalog/products/${productId}/variants`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-api-key': apiKey,
        },
      }
    );

    if (!variantsRes.ok) {
      console.log(`[STOCKX] Variants fetch failed: ${variantsRes.status}`);
      return null;
    }

    const variants = await variantsRes.json();
    let targetVariantId: string | null = null;

    for (const variant of variants) {
      if (variant.variantValue === size || variant.variantValue === String(size)) {
        targetVariantId = variant.variantId;
        break;
      }
    }

    // Fallback to first variant if size not found
    if (!targetVariantId && variants.length > 0) {
      targetVariantId = variants[0].variantId;
      console.log(`[STOCKX] Size ${size} not found, using first variant`);
    }

    // Step 3: Get market data
    const marketRes = await fetch(
      `https://api.stockx.com/v2/catalog/products/${productId}/market-data`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-api-key': apiKey,
        },
      }
    );

    if (!marketRes.ok) {
      console.log(`[STOCKX] Market data fetch failed: ${marketRes.status}`);
      return null;
    }

    const marketData = await marketRes.json();

    // Find market data for target variant
    const variantMarket = marketData.find((m: any) => m.variantId === targetVariantId);

    if (variantMarket) {
      const lowestAsk = variantMarket.lowestAskAmount || variantMarket.earnMoreAmount || variantMarket.sellFasterAmount;
      if (lowestAsk) {
        console.log(`[STOCKX] ${sku} Size ${size}: $${lowestAsk}`);
        return Number(lowestAsk);
      }
    }

    // Fallback: use first available market data
    if (marketData.length > 0) {
      const firstMarket = marketData[0];
      const price = firstMarket.lowestAskAmount || firstMarket.earnMoreAmount || firstMarket.sellFasterAmount;
      if (price) {
        console.log(`[STOCKX] ${sku} (fallback): $${price}`);
        return Number(price);
      }
    }

    console.log(`[STOCKX] No price data for ${sku}`);
    return null;
  } catch (error) {
    console.error('[STOCKX] API error:', error.message || error);
    return null;
  }
}

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
  // Try authenticated StockX API first (most reliable)
  if (asset.stockx_sku) {
    try {
      const authPrice = await fetchStockXAuthenticatedPrice(asset.stockx_sku, asset.size || '10');
      if (authPrice !== null) {
        return authPrice;
      }
    } catch (error) {
      console.log('[STOCKX] Authenticated API failed, falling back to scraping');
    }
  }

  // Fallback to unauthenticated scraping (likely to be blocked but worth trying)
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

const processPriceAlerts = async (
  supabaseAdmin: any,
  results: UpdateOutcome[]
) => {
  const changedResults = results.filter(result => result.changed);
  if (changedResults.length === 0) {
    return 0;
  }

  const assetIds = changedResults.map(result => result.asset_id);
  const { data: alerts, error } = await supabaseAdmin
    .from('price_alerts')
    .select('id, user_id, asset_id, type, threshold')
    .in('asset_id', assetIds)
    .eq('is_active', true);

  if (error || !alerts || alerts.length === 0) {
    return 0;
  }

  const resultMap = new Map(changedResults.map(result => [result.asset_id, result]));
  const notifications: any[] = [];
  const triggeredAlertIds: string[] = [];

  for (const alert of alerts) {
    const result = resultMap.get(alert.asset_id);
    if (!result) continue;

    const previous = result.previous_price;
    const current = result.new_price;
    let triggered = false;

    if (alert.type === 'above' && previous < alert.threshold && current >= alert.threshold) {
      triggered = true;
    }

    if (alert.type === 'below' && previous > alert.threshold && current <= alert.threshold) {
      triggered = true;
    }

    if (!triggered) continue;

    triggeredAlertIds.push(alert.id);
    notifications.push({
      user_id: alert.user_id,
      title: `${result.name || 'Asset'} alert`,
      body: `Price is now ${formatCurrency(current)} (${alert.type} ${formatCurrency(alert.threshold)})`,
      data: {
        asset_id: alert.asset_id,
        alert_id: alert.id,
        price: current,
        threshold: alert.threshold,
        type: alert.type,
      },
    });
  }

  if (triggeredAlertIds.length > 0) {
    await supabaseAdmin
      .from('price_alerts')
      .update({ last_triggered_at: new Date().toISOString() })
      .in('id', triggeredAlertIds);
  }

  if (notifications.length > 0) {
    await supabaseAdmin
      .from('notifications')
      .insert(notifications);
  }

  return notifications.length;
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

    let alertsTriggered = 0;
    try {
      alertsTriggered = await processPriceAlerts(supabaseAdmin, results);
    } catch (error) {
      console.error('Alert processing failed:', error);
    }

    return c.json({
      ok: true,
      processed: processedCount,
      updated: updatedCount,
      failed: failedCount,
      tokens_synced: tokensSynced,
      alerts_triggered: alertsTriggered,
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
