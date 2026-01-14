// supabase/functions/get-offers/index.ts
// Unified Market Index - Multi-source price aggregation
// Sources: GOAT, eBay, Nike, Adidas (REAL APIs only, no fake data)
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// BloomOffer - normalized offer from any source
interface BloomOffer {
  offer_id: string;
  catalog_item_id: string | null;
  title: string;
  image: string | null;
  price: number;
  total_estimate: number;
  currency: 'USD';
  source: string;
  condition: 'new' | 'used' | 'deadstock';
  source_url: string;
  last_updated_at: string;
}

// Query parser - extracts source filter from query
function parseQuery(query: string): { base_query: string; source_filter: string | null } {
  const sources = ['stockx', 'ebay', 'goat', 'adidas', 'nike', 'grailed', 'poshmark'];
  const words = query.toLowerCase().trim().split(/\s+/);
  const lastWord = words[words.length - 1];

  if (sources.includes(lastWord)) {
    return {
      base_query: words.slice(0, -1).join(' ') || lastWord,
      source_filter: lastWord,
    };
  }

  return { base_query: query.trim(), source_filter: null };
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

// ============ GOAT ADAPTER (REAL API) ============
async function getGoatOffers(query: string, limit: number): Promise<BloomOffer[]> {
  try {
    console.log(`[GOAT] Searching for "${query}"...`);

    // Use product_variants_v2 with distinct:1 to get unique products
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
          distinct: 1, // KEY: Get unique products, not size variants
        }),
      },
      5000
    );

    if (!response.ok) {
      const text = await response.text();
      console.error(`[GOAT] API error ${response.status}: ${text.substring(0, 200)}`);
      return [];
    }

    const data = await response.json();
    const hits = data.hits || [];
    console.log(`[GOAT] Got ${hits.length} unique products (from ${data.nbHits} total)`);

    const offers = hits.map((hit: any) => {
      // GOAT prices are in cents
      const lowestPrice = hit.lowest_price_cents ? hit.lowest_price_cents / 100 : 0;
      const retailPrice = hit.retail_price_cents ? hit.retail_price_cents / 100 : 0;
      const instantPrice = hit.instant_ship_lowest_price_cents ? hit.instant_ship_lowest_price_cents / 100 : 0;
      const price = lowestPrice > 0 ? lowestPrice : (instantPrice > 0 ? instantPrice : retailPrice);

      return {
        offer_id: `goat:${hit.slug || hit.id}`,
        catalog_item_id: null,
        title: hit.name || hit.product_title || 'GOAT Product',
        image: hit.main_picture_url || hit.grid_picture_url || hit.picture_url || null,
        price: price,
        total_estimate: price > 0 ? Math.round(price * 1.10 + 15) : 0, // 10% fee + $15 ship
        currency: 'USD' as const,
        source: 'goat',
        condition: 'deadstock' as const,
        source_url: hit.slug
          ? `https://www.goat.com/sneakers/${hit.slug}`
          : `https://www.goat.com/search?query=${encodeURIComponent(query)}`,
        last_updated_at: new Date().toISOString(),
      };
    }).filter((o: BloomOffer) => o.title && o.price > 0);

    console.log(`[GOAT] Returning ${offers.length} offers with prices`);
    return offers;
  } catch (e) {
    console.error('[GOAT] Error:', e);
    return [];
  }
}

// ============ STOCKX ADAPTER (Official API v2 with OAuth) ============
async function getStockXOffers(supabase: any, query: string, limit: number): Promise<BloomOffer[]> {
  const apiKey = Deno.env.get('STOCKX_API_KEY');
  const clientId = Deno.env.get('STOCKX_CLIENT_ID');
  const clientSecret = Deno.env.get('STOCKX_CLIENT_SECRET');

  // Try official API if credentials are available
  if (apiKey && clientId && clientSecret) {
    try {
      console.log(`[StockX] Using official API for "${query}"...`);

      // Get refresh token from database
      const { data: tokenData } = await supabase.rpc('get_stockx_tokens');
      const refreshToken = tokenData?.[0]?.refresh_token;

      if (refreshToken) {
        // Get access token
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

        if (tokenResponse.ok) {
          const tokenJson = await tokenResponse.json();
          const accessToken = tokenJson.access_token;

          // Search with official API
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

          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            const products = searchData.products || [];
            console.log(`[StockX] Official API returned ${products.length} products`);

            // Get market data for each product
            const offers: BloomOffer[] = [];
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
                      offer_id: `stockx:${product.urlKey || product.productId}`,
                      catalog_item_id: null,
                      title: product.title || product.name,
                      image: product.media?.thumbUrl || product.media?.imageUrl || null,
                      price: lowestAsk,
                      total_estimate: Math.round(lowestAsk * 1.12 + 14),
                      currency: 'USD' as const,
                      source: 'stockx',
                      condition: 'deadstock' as const,
                      source_url: `https://stockx.com/${product.urlKey || ''}`,
                      last_updated_at: new Date().toISOString(),
                    });
                  }
                }
              } catch (e) {
                // Skip this product if market data fails
              }
            }

            if (offers.length > 0) {
              console.log(`[StockX] Returning ${offers.length} offers with real prices`);
              return offers;
            }
          }
        }
      }
    } catch (e) {
      console.error('[StockX] Official API error:', e);
    }
  }

  // Fallback: Try public browse endpoint (often blocked but worth trying)
  try {
    console.log(`[StockX] Trying public API for "${query}"...`);

    const response = await fetchWithTimeout(
      `https://stockx.com/api/browse?_search=${encodeURIComponent(query)}&page=1&resultsPerPage=${limit}`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      },
      5000
    );

    if (response.ok) {
      const data = await response.json();
      const products = data.Products || data.products || [];
      console.log(`[StockX] Public API returned ${products.length} products`);

      return products.map((p: any) => ({
        offer_id: `stockx:${p.urlKey || p.id}`,
        catalog_item_id: null,
        title: p.title || p.shortDescription || 'StockX Product',
        image: p.media?.thumbUrl || null,
        price: p.market?.lowestAsk || 0,
        total_estimate: p.market?.lowestAsk ? Math.round(p.market.lowestAsk * 1.12 + 14) : 0,
        currency: 'USD' as const,
        source: 'stockx',
        condition: 'deadstock' as const,
        source_url: p.urlKey ? `https://stockx.com/${p.urlKey}` : `https://stockx.com/search?s=${encodeURIComponent(query)}`,
        last_updated_at: new Date().toISOString(),
      })).filter((o: BloomOffer) => o.price > 0);
    }
  } catch (e) {
    console.error('[StockX] Public API error:', e);
  }

  console.log('[StockX] No results from any endpoint');
  return [];
}

// ============ GRAILED ADAPTER (Resale marketplace for used/vintage) ============
async function getGrailedOffers(query: string, limit: number): Promise<BloomOffer[]> {
  try {
    console.log(`[Grailed] Searching for "${query}"...`);

    // Try Grailed's public API endpoint
    const response = await fetchWithTimeout(
      `https://www.grailed.com/api/merchandise/marquee/listings?` +
      `sold=false&on_sale=false&staff_pick=false&department=footwear&` +
      `query=${encodeURIComponent(query)}&page=1&hitsPerPage=${limit}`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      },
      5000
    );

    if (!response.ok) {
      console.error(`[Grailed] API error ${response.status}`);
      return [];
    }

    const data = await response.json();
    const listings = data.data || data.listings || data.hits || [];
    console.log(`[Grailed] Got ${listings.length} listings`);

    const offers = listings.map((listing: any) => {
      const price = listing.price || listing.asking_price || 0;
      return {
        offer_id: `grailed:${listing.id}`,
        catalog_item_id: null,
        title: listing.title || listing.designer?.name + ' ' + (listing.description?.substring(0, 50) || '') || 'Grailed Item',
        image: listing.cover_photo?.url || listing.photos?.[0]?.url || listing.image_url || null,
        price: price,
        total_estimate: price > 0 ? Math.round(price * 1.09 + 10) : 0, // 9% fee + $10 ship estimate
        currency: 'USD' as const,
        source: 'grailed',
        condition: 'used' as const,
        source_url: listing.id ? `https://www.grailed.com/listings/${listing.id}` : `https://www.grailed.com/shop?query=${encodeURIComponent(query)}`,
        last_updated_at: new Date().toISOString(),
      };
    }).filter((o: BloomOffer) => o.title && o.price > 0);

    console.log(`[Grailed] Returning ${offers.length} offers`);
    return offers;
  } catch (e) {
    console.error('[Grailed] Error:', e);
    return [];
  }
}

// ============ NIKE ADAPTER (REAL API) ============
async function getNikeOffers(query: string, limit: number): Promise<BloomOffer[]> {
  try {
    console.log(`[Nike] Searching for "${query}"...`);

    const response = await fetchWithTimeout(
      `https://api.nike.com/cic/browse/v2?queryid=products&anonymousId=anon&country=us&endpoint=%2Fproduct_feed%2Frollup_threads%2Fv2&language=en&localizedRangeStr=%7BlowestPrice%7D%20%E2%80%94%20%7BhighestPrice%7D&count=${limit}&anchor=0&consumerChannelId=d9a5bc42-4b9c-4976-858a-f159cf99c647&query=${encodeURIComponent(query)}`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      },
      5000
    );

    if (!response.ok) {
      const text = await response.text();
      console.error(`[Nike] API error ${response.status}: ${text.substring(0, 200)}`);
      return [];
    }

    const data = await response.json();
    console.log(`[Nike] Response keys: ${Object.keys(data).join(', ')}`);
    const products = data.data?.products?.products || [];
    console.log(`[Nike] Got ${products.length} products`);

    const offers = products.map((p: any) => {
      const price = p.price?.currentPrice || p.price?.fullPrice || 0;
      return {
        offer_id: `nike:${p.id}`,
        catalog_item_id: null,
        title: p.title || p.subtitle || 'Nike Product',
        image: p.images?.squarishURL || p.colorways?.[0]?.images?.squarishURL || null,
        price: price,
        total_estimate: price > 0 ? Math.round(price + 10) : 0, // ~$10 shipping
        currency: 'USD' as const,
        source: 'nike',
        condition: 'new' as const,
        source_url: p.url
          ? `https://www.nike.com${p.url.startsWith('/') ? '' : '/'}${p.url}`
          : `https://www.nike.com/w?q=${encodeURIComponent(query)}`,
        last_updated_at: new Date().toISOString(),
      };
    }).filter((o: BloomOffer) => o.title && o.price > 0);

    console.log(`[Nike] Returning ${offers.length} offers with prices`);
    return offers;
  } catch (e) {
    console.error('[Nike] Error:', e);
    return [];
  }
}

// ============ ADIDAS ADAPTER (REAL API) ============
async function getAdidasOffers(query: string, limit: number): Promise<BloomOffer[]> {
  try {
    console.log(`[Adidas] Searching for "${query}"...`);

    const response = await fetchWithTimeout(
      `https://www.adidas.com/api/plp/content-engine?sitePath=us&query=${encodeURIComponent(query)}`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      },
      5000
    );

    if (!response.ok) {
      const text = await response.text();
      console.error(`[Adidas] API error ${response.status}: ${text.substring(0, 200)}`);
      return [];
    }

    const data = await response.json();
    console.log(`[Adidas] Response keys: ${Object.keys(data).join(', ')}`);
    const items = data.raw?.itemList?.items || data.items || [];
    console.log(`[Adidas] Got ${items.length} items`);

    const offers = items.slice(0, limit).map((item: any) => {
      const price = item.salePrice || item.price || 0;
      return {
        offer_id: `adidas:${item.productId || item.modelId}`,
        catalog_item_id: null,
        title: item.displayName || item.name || 'Adidas Product',
        image: item.image?.src || item.images?.[0]?.src || null,
        price: price,
        total_estimate: price > 0 ? Math.round(price + 10) : 0, // ~$10 shipping
        currency: 'USD' as const,
        source: 'adidas',
        condition: 'new' as const,
        source_url: item.link
          ? `https://www.adidas.com${item.link}`
          : `https://www.adidas.com/us/search?q=${encodeURIComponent(query)}`,
        last_updated_at: new Date().toISOString(),
      };
    }).filter((o: BloomOffer) => o.title && o.price > 0);

    console.log(`[Adidas] Returning ${offers.length} offers with prices`);
    return offers;
  } catch (e) {
    console.error('[Adidas] Error:', e);
    return [];
  }
}

// ============ EBAY ADAPTER (Finding API - no OAuth needed) ============
async function getEbayOffers(query: string, limit: number): Promise<BloomOffer[]> {
  const ebayAppId = Deno.env.get('EBAY_APP_ID');

  // Also try the Browse API token if available
  const ebayAccessToken = Deno.env.get('EBAY_ACCESS_TOKEN');

  if (ebayAccessToken) {
    // Use Browse API if we have OAuth token
    try {
      console.log(`[eBay] Using Browse API for "${query}"...`);

      const response = await fetchWithTimeout(
        `https://api.ebay.com/buy/browse/v1/item_summary/search?` +
        `q=${encodeURIComponent(query + ' shoes')}` +
        `&filter=buyingOptions:{FIXED_PRICE}` +
        `&category_ids=93427` +
        `&limit=${limit}`,
        {
          headers: {
            'Authorization': `Bearer ${ebayAccessToken}`,
            'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
            'Content-Type': 'application/json',
          },
        },
        5000
      );

      if (response.ok) {
        const data = await response.json();
        const items = data.itemSummaries || [];
        console.log(`[eBay] Got ${items.length} items from Browse API`);

        return items.map((item: any) => {
          const price = parseFloat(item.price?.value || '0');
          const shipping = parseFloat(item.shippingOptions?.[0]?.shippingCost?.value || '0');

          return {
            offer_id: `ebay:${item.itemId}`,
            catalog_item_id: null,
            title: item.title,
            image: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl,
            price: price,
            total_estimate: Math.round(price + shipping),
            currency: 'USD' as const,
            source: 'ebay',
            condition: item.condition?.toLowerCase() === 'new' ? 'new' as const : 'used' as const,
            source_url: item.itemWebUrl,
            last_updated_at: new Date().toISOString(),
          };
        }).filter((o: BloomOffer) => o.price > 0);
      }
    } catch (e) {
      console.error('[eBay] Browse API error:', e);
    }
  }

  if (ebayAppId) {
    // Use Finding API (simpler, just needs App ID)
    try {
      console.log(`[eBay] Using Finding API for "${query}"...`);

      const response = await fetchWithTimeout(
        `https://svcs.ebay.com/services/search/FindingService/v1?` +
        `OPERATION-NAME=findItemsByKeywords` +
        `&SERVICE-VERSION=1.0.0` +
        `&SECURITY-APPNAME=${ebayAppId}` +
        `&RESPONSE-DATA-FORMAT=JSON` +
        `&REST-PAYLOAD` +
        `&keywords=${encodeURIComponent(query + ' sneakers')}` +
        `&categoryId=93427` +
        `&itemFilter(0).name=ListingType&itemFilter(0).value=FixedPrice` +
        `&paginationInput.entriesPerPage=${limit}`,
        {
          headers: {
            'Accept': 'application/json',
          },
        },
        5000
      );

      if (response.ok) {
        const data = await response.json();
        const items = data.findItemsByKeywordsResponse?.[0]?.searchResult?.[0]?.item || [];
        console.log(`[eBay] Got ${items.length} items from Finding API`);

        return items.map((item: any) => {
          const price = parseFloat(item.sellingStatus?.[0]?.currentPrice?.[0]?.__value__ || '0');
          const shipping = parseFloat(item.shippingInfo?.[0]?.shippingServiceCost?.[0]?.__value__ || '0');

          return {
            offer_id: `ebay:${item.itemId?.[0]}`,
            catalog_item_id: null,
            title: item.title?.[0] || 'eBay Item',
            image: item.galleryURL?.[0] || null,
            price: price,
            total_estimate: Math.round(price + shipping),
            currency: 'USD' as const,
            source: 'ebay',
            condition: item.condition?.[0]?.conditionDisplayName?.[0]?.toLowerCase()?.includes('new')
              ? 'new' as const
              : 'used' as const,
            source_url: item.viewItemURL?.[0],
            last_updated_at: new Date().toISOString(),
          };
        }).filter((o: BloomOffer) => o.price > 0);
      }
    } catch (e) {
      console.error('[eBay] Finding API error:', e);
    }
  }

  console.log('[eBay] No credentials configured, skipping');
  return [];
}

// ============ CATALOG FALLBACK (Local DB, marked as catalog) ============
async function getCatalogFallback(
  supabase: any,
  query: string,
  limit: number
): Promise<BloomOffer[]> {
  try {
    console.log(`[Catalog] Fallback search for "${query}"...`);

    const { data: items, error } = await supabase
      .from('catalog_items')
      .select('id, display_name, brand, style_code, image_url_thumb')
      .or(`display_name.ilike.%${query}%,brand.ilike.%${query}%,style_code.ilike.%${query}%`)
      .limit(limit);

    if (error || !items) {
      console.error('[Catalog] Error:', error);
      return [];
    }

    console.log(`[Catalog] Found ${items.length} items`);

    // Return without price (price = 0 means "price unknown")
    return items.map((item: any) => ({
      offer_id: `catalog:${item.id}`,
      catalog_item_id: item.id,
      title: item.display_name,
      image: item.image_url_thumb,
      price: 0,
      total_estimate: 0,
      currency: 'USD' as const,
      source: 'catalog',
      condition: 'deadstock' as const,
      source_url: `https://stockx.com/search?s=${encodeURIComponent(item.display_name)}`,
      last_updated_at: new Date().toISOString(),
    }));
  } catch (e) {
    console.error('[Catalog] Error:', e);
    return [];
  }
}

// ============ MAIN HANDLER ============
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);

  try {
    if (req.method === 'GET') {
      const query = url.searchParams.get('q');
      const limitParam = url.searchParams.get('limit');
      const limit = Math.min(parseInt(limitParam || '20'), 50);

      if (!query) {
        return new Response(
          JSON.stringify({ error: 'Query parameter "q" is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { base_query, source_filter } = parseQuery(query);

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const allOffers: BloomOffer[] = [];
      const sourceResults: Record<string, number> = {};

      console.log(`\n========== GET-OFFERS: "${base_query}" ==========`);

      if (!source_filter) {
        // Fetch from ALL sources in parallel
        const [goatOffers, stockxOffers, grailedOffers, ebayOffers] = await Promise.allSettled([
          getGoatOffers(base_query, limit),
          getStockXOffers(supabase, base_query, limit),
          getGrailedOffers(base_query, limit),
          getEbayOffers(base_query, limit),
        ]);

        // Process results
        if (goatOffers.status === 'fulfilled') {
          allOffers.push(...goatOffers.value);
          sourceResults['goat'] = goatOffers.value.length;
        } else {
          sourceResults['goat'] = -1;
          console.error('[GOAT] FAILED:', (goatOffers as any).reason);
        }

        if (stockxOffers.status === 'fulfilled') {
          allOffers.push(...stockxOffers.value);
          sourceResults['stockx'] = stockxOffers.value.length;
        } else {
          sourceResults['stockx'] = -1;
          console.error('[StockX] FAILED:', (stockxOffers as any).reason);
        }

        if (grailedOffers.status === 'fulfilled') {
          allOffers.push(...grailedOffers.value);
          sourceResults['grailed'] = grailedOffers.value.length;
        } else {
          sourceResults['grailed'] = -1;
          console.error('[Grailed] FAILED:', (grailedOffers as any).reason);
        }

        if (ebayOffers.status === 'fulfilled') {
          allOffers.push(...ebayOffers.value);
          sourceResults['ebay'] = ebayOffers.value.length;
        } else {
          sourceResults['ebay'] = -1;
          console.error('[eBay] FAILED:', (ebayOffers as any).reason);
        }

        // If no results from any source, fall back to catalog
        if (allOffers.length === 0) {
          console.log('[get-offers] No results from any source, using catalog fallback...');
          const catalogOffers = await getCatalogFallback(supabase, base_query, limit);
          allOffers.push(...catalogOffers);
          sourceResults['catalog'] = catalogOffers.length;
        }

        console.log(`\n[get-offers] RESULTS: ${JSON.stringify(sourceResults)}`);
        console.log(`[get-offers] TOTAL: ${allOffers.length} offers`);
      } else {
        // Filter to specific source
        switch (source_filter) {
          case 'goat':
            allOffers.push(...await getGoatOffers(base_query, limit));
            break;
          case 'stockx':
            allOffers.push(...await getStockXOffers(supabase, base_query, limit));
            break;
          case 'grailed':
            allOffers.push(...await getGrailedOffers(base_query, limit));
            break;
          case 'ebay':
            allOffers.push(...await getEbayOffers(base_query, limit));
            break;
          default:
            allOffers.push(...await getCatalogFallback(supabase, base_query, limit));
        }
      }

      // Sort by total_estimate (cheapest first), items with price 0 go to end
      allOffers.sort((a, b) => {
        if (a.total_estimate === 0 && b.total_estimate === 0) return 0;
        if (a.total_estimate === 0) return 1;
        if (b.total_estimate === 0) return -1;
        return a.total_estimate - b.total_estimate;
      });

      return new Response(
        JSON.stringify({
          query: base_query,
          source_filter,
          offers: allOffers.slice(0, limit),
          sources_searched: source_filter
            ? [source_filter]
            : ['goat', 'stockx', 'grailed', 'ebay'],
          source_results: sourceResults,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
