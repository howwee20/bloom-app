// supabase/functions/offers/index.ts
// Cached Offers API - Part of "Backrub for Commerce" architecture
// GET: Serve cached offers (instant)
// POST: Trigger refresh (background)

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CachedOffer {
  id: string;
  merchant: string;
  price: number;
  currency: string;
  in_stock: boolean;
  sizes: Array<{ size: string; available: boolean; price?: number }> | null;
  image_url: string | null;
  product_url: string;
  condition: string;
  title: string | null;
  fetched_at: string;
  is_stale: boolean;
}

// Helper: fetch with timeout
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = 5000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);
    return response;
  } catch (e: any) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw e;
  }
}

// ============ GET CACHED OFFERS ============
async function getCachedOffers(
  supabase: any,
  options: { productId?: string; styleCode?: string; includeExpired?: boolean }
): Promise<{ offers: CachedOffer[]; allStale: boolean; hasOffers: boolean }> {
  const { productId, styleCode, includeExpired = false } = options;

  const { data, error } = await supabase.rpc('get_offers_for_product', {
    p_product_id: productId || null,
    p_style_code: styleCode || null,
    p_include_expired: includeExpired,
  });

  if (error) {
    console.error('[Offers] Failed to get cached offers:', error);
    return { offers: [], allStale: true, hasOffers: false };
  }

  const offers: CachedOffer[] = (data || []).map((row: any) => ({
    id: row.id,
    merchant: row.merchant,
    price: Number(row.price),
    currency: row.currency || 'USD',
    in_stock: row.in_stock,
    sizes: row.sizes,
    image_url: row.image_url,
    product_url: row.product_url,
    condition: row.condition || 'new',
    title: row.title,
    fetched_at: row.fetched_at,
    is_stale: row.is_stale,
  }));

  const hasOffers = offers.length > 0;
  const allStale = hasOffers && offers.every(o => o.is_stale);

  return { offers, allStale, hasOffers };
}

// ============ GOAT ADAPTER (for refresh) ============
async function fetchGoatOffers(query: string, limit: number = 20): Promise<any[]> {
  try {
    console.log(`[GOAT] Fetching offers for "${query}"...`);

    const response = await fetchWithTimeout(
      'https://2fwotdvm2o-dsn.algolia.net/1/indexes/product_variants_v2/query',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Algolia-API-Key': 'ac96de6fef0e02bb95d433d8d5c7038a',
          'X-Algolia-Application-Id': '2FWOTDVM2O',
        },
        body: JSON.stringify({
          query: query,
          hitsPerPage: limit,
          distinct: 1,
        }),
      },
      5000
    );

    if (!response.ok) return [];

    const data = await response.json();
    const hits = data.hits || [];

    return hits.map((hit: any) => {
      const lowestPrice = hit.lowest_price_cents ? hit.lowest_price_cents / 100 : 0;
      const retailPrice = hit.retail_price_cents ? hit.retail_price_cents / 100 : 0;
      const instantPrice = hit.instant_ship_lowest_price_cents ? hit.instant_ship_lowest_price_cents / 100 : 0;
      const price = lowestPrice > 0 ? lowestPrice : (instantPrice > 0 ? instantPrice : retailPrice);

      return {
        merchant: 'goat',
        price: price,
        title: hit.name || hit.product_title,
        image_url: hit.main_picture_url || hit.grid_picture_url,
        product_url: hit.slug ? `https://www.goat.com/sneakers/${hit.slug}` : null,
        style_code: hit.sku || null,
        condition: 'deadstock',
      };
    }).filter((o: any) => o.price > 0);
  } catch (e) {
    console.error('[GOAT] Error:', e);
    return [];
  }
}

// ============ STOCKX ADAPTER (for refresh) ============
async function fetchStockXOffers(supabase: any, query: string, limit: number = 20): Promise<any[]> {
  const apiKey = Deno.env.get('STOCKX_API_KEY');
  const clientId = Deno.env.get('STOCKX_CLIENT_ID');
  const clientSecret = Deno.env.get('STOCKX_CLIENT_SECRET');

  if (!apiKey || !clientId || !clientSecret) {
    console.log('[StockX] Missing credentials');
    return [];
  }

  try {
    const { data: tokenData } = await supabase.rpc('get_stockx_tokens');
    const refreshToken = tokenData?.[0]?.refresh_token;

    if (!refreshToken) return [];

    const basicAuth = btoa(`${clientId}:${clientSecret}`);
    const tokenResponse = await fetchWithTimeout(
      'https://accounts.stockx.com/oauth/token',
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }).toString(),
      },
      5000
    );

    if (!tokenResponse.ok) return [];

    const tokenJson = await tokenResponse.json();
    const accessToken = tokenJson.access_token;

    const searchResponse = await fetchWithTimeout(
      `https://api.stockx.com/v2/catalog/search?query=${encodeURIComponent(query)}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'x-api-key': apiKey,
        },
      },
      5000
    );

    if (!searchResponse.ok) return [];

    const searchData = await searchResponse.json();
    const products = searchData.products || [];

    const offers: any[] = [];
    for (const product of products.slice(0, limit)) {
      try {
        const marketResponse = await fetchWithTimeout(
          `https://api.stockx.com/v2/catalog/products/${product.productId}/market-data`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'x-api-key': apiKey,
            },
          },
          3000
        );

        if (marketResponse.ok) {
          const marketData = await marketResponse.json();
          const firstVariant = marketData[0];
          const lowestAsk = firstVariant?.lowestAskAmount || 0;

          if (lowestAsk > 0) {
            offers.push({
              merchant: 'stockx',
              price: lowestAsk,
              title: product.title || product.name,
              image_url: product.media?.thumbUrl || product.media?.imageUrl,
              product_url: `https://stockx.com/${product.urlKey || ''}`,
              style_code: product.styleId || null,
              condition: 'deadstock',
            });
          }
        }
      } catch (e) {
        // Skip this product
      }
    }

    return offers;
  } catch (e) {
    console.error('[StockX] Error:', e);
    return [];
  }
}

// ============ SAVE OFFERS TO CACHE ============
async function saveOffersToCache(
  supabase: any,
  offers: any[],
  productId: string | null,
  styleCode: string
): Promise<number> {
  let saved = 0;

  for (const offer of offers) {
    try {
      const ttl = offer.merchant === 'goat' || offer.merchant === 'stockx' ? 15 : 30;

      const { error } = await supabase.rpc('upsert_offer', {
        p_product_id: productId,
        p_style_code: styleCode || offer.style_code || 'unknown',
        p_merchant: offer.merchant,
        p_price: offer.price,
        p_product_url: offer.product_url || '',
        p_image_url: offer.image_url,
        p_title: offer.title,
        p_sizes: offer.sizes || null,
        p_condition: offer.condition || 'new',
        p_ttl_minutes: ttl,
      });

      if (!error) saved++;
    } catch (e) {
      console.error('[Cache] Failed to save offer:', e);
    }
  }

  return saved;
}

// ============ REFRESH OFFERS ============
async function refreshOffers(
  supabase: any,
  options: { productId?: string; styleCode?: string; query?: string }
): Promise<{ refreshed: number; sources: string[] }> {
  const { productId, styleCode, query } = options;
  const searchQuery = query || styleCode || '';

  if (!searchQuery) {
    return { refreshed: 0, sources: [] };
  }

  console.log(`[Refresh] Starting refresh for "${searchQuery}"...`);

  const [goatOffers, stockxOffers] = await Promise.allSettled([
    fetchGoatOffers(searchQuery, 10),
    fetchStockXOffers(supabase, searchQuery, 10),
  ]);

  const allOffers: any[] = [];
  const sources: string[] = [];

  if (goatOffers.status === 'fulfilled' && goatOffers.value.length > 0) {
    allOffers.push(...goatOffers.value);
    sources.push('goat');
  }

  if (stockxOffers.status === 'fulfilled' && stockxOffers.value.length > 0) {
    allOffers.push(...stockxOffers.value);
    sources.push('stockx');
  }

  console.log(`[Refresh] Found ${allOffers.length} offers from ${sources.join(', ')}`);

  const saved = await saveOffersToCache(supabase, allOffers, productId || null, styleCode || searchQuery);

  return { refreshed: saved, sources };
}

// ============ MAIN HANDLER ============
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (req.method === 'GET') {
      // GET /offers?product_id=... or ?style_code=...
      const productId = url.searchParams.get('product_id');
      const styleCode = url.searchParams.get('style_code');
      const includeExpired = url.searchParams.get('include_expired') === 'true';
      const autoRefresh = url.searchParams.get('auto_refresh') !== 'false'; // Default true

      if (!productId && !styleCode) {
        return new Response(
          JSON.stringify({ error: 'Either product_id or style_code is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get cached offers
      const cached = await getCachedOffers(supabase, { productId: productId || undefined, styleCode: styleCode || undefined, includeExpired });

      // If no offers or all stale, trigger refresh if auto_refresh is enabled
      if (autoRefresh && (!cached.hasOffers || cached.allStale)) {
        console.log('[Offers] No fresh offers, triggering refresh...');
        const refreshResult = await refreshOffers(supabase, {
          productId: productId || undefined,
          styleCode: styleCode || undefined,
          query: styleCode || undefined,
        });

        // Re-fetch after refresh
        if (refreshResult.refreshed > 0) {
          const refreshed = await getCachedOffers(supabase, { productId: productId || undefined, styleCode: styleCode || undefined, includeExpired: false });
          return new Response(
            JSON.stringify({
              offers: refreshed.offers,
              from_cache: false,
              refresh_triggered: true,
              sources_refreshed: refreshResult.sources,
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      return new Response(
        JSON.stringify({
          offers: cached.offers,
          from_cache: true,
          all_stale: cached.allStale,
          refresh_triggered: false,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (req.method === 'POST') {
      // POST /offers/refresh - Trigger refresh
      const body = await req.json().catch(() => ({}));
      const { product_id, style_code, query } = body;

      if (!product_id && !style_code && !query) {
        return new Response(
          JSON.stringify({ error: 'Either product_id, style_code, or query is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const result = await refreshOffers(supabase, {
        productId: product_id,
        styleCode: style_code,
        query: query,
      });

      return new Response(
        JSON.stringify({
          success: true,
          refreshed: result.refreshed,
          sources: result.sources,
        }),
        { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
