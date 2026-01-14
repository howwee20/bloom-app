// supabase/functions/get-offers/index.ts
// Unified Market Index - Multi-source price aggregation
// Sources: StockX, Nike, Adidas, GOAT, eBay
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

// ============ STOCKX ADAPTER ============
async function getStockXOffers(
  supabase: any,
  query: string,
  limit: number
): Promise<BloomOffer[]> {
  const STOCKX_FEE_RATE = 0.12;
  const STOCKX_SHIPPING = 14;

  try {
    // Search catalog_items directly using ilike for text matching
    const { data: items, error } = await supabase
      .from('catalog_items')
      .select('id, display_name, brand, style_code, image_url_thumb')
      .or(`display_name.ilike.%${query}%,brand.ilike.%${query}%,style_code.ilike.%${query}%`)
      .limit(limit);

    if (error || !items) {
      console.error('StockX adapter error:', error);
      return [];
    }

    console.log(`StockX adapter found ${items.length} items for "${query}"`);

    // Return catalog items with estimated StockX pricing
    // Since we don't have live prices, use placeholder pricing based on brand
    return items.map((item: any) => {
      // Estimate price based on brand (placeholder until we have real price data)
      const brandPrices: Record<string, number> = {
        'Jordan': 180,
        'Nike': 150,
        'Adidas': 120,
        'New Balance': 130,
        'Yeezy': 250,
      };
      const basePrice = brandPrices[item.brand] || 150;
      const total = basePrice * (1 + STOCKX_FEE_RATE) + STOCKX_SHIPPING;

      return {
        offer_id: `stockx:${item.id}`,
        catalog_item_id: item.id,
        title: item.display_name,
        image: item.image_url_thumb,
        price: basePrice,
        total_estimate: Math.round(total),
        currency: 'USD' as const,
        source: 'stockx',
        condition: 'deadstock' as const,
        source_url: `https://stockx.com/search?s=${encodeURIComponent(item.display_name)}`,
        last_updated_at: new Date().toISOString(),
      };
    });
  } catch (e) {
    console.error('StockX error:', e);
    return [];
  }
}

// ============ NIKE ADAPTER ============
async function getNikeOffers(query: string, limit: number): Promise<BloomOffer[]> {
  try {
    const response = await fetch(
      `https://api.nike.com/cic/browse/v2?queryid=products&anonymousId=anon&country=us&endpoint=%2Fproduct_feed%2Frollup_threads%2Fv2&language=en&localizedRangeStr=%7BlowestPrice%7D%20%E2%80%94%20%7BhighestPrice%7D&count=${limit}&anchor=0&consumerChannelId=d9a5bc42-4b9c-4976-858a-f159cf99c647&query=${encodeURIComponent(query)}`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      }
    );

    if (!response.ok) {
      console.error('Nike API error:', response.status);
      return [];
    }

    const data = await response.json();
    const products = data.data?.products?.products || [];

    return products.map((p: any) => {
      const price = p.price?.currentPrice || p.price?.fullPrice || 0;
      return {
        offer_id: `nike:${p.id}`,
        catalog_item_id: null,
        title: p.title || p.subtitle || 'Nike Product',
        image: p.images?.squarishURL || p.colorways?.[0]?.images?.squarishURL || null,
        price: price,
        total_estimate: price > 0 ? price + 10 : 0,
        currency: 'USD' as const,
        source: 'nike',
        condition: 'new' as const,
        source_url: p.url ? `https://www.nike.com${p.url.startsWith('/') ? '' : '/'}${p.url}` : `https://www.nike.com/w?q=${encodeURIComponent(query)}`,
        last_updated_at: new Date().toISOString(),
      };
    }).filter((o: BloomOffer) => o.title);
  } catch (e) {
    console.error('Nike error:', e);
    return [];
  }
}

// ============ ADIDAS ADAPTER ============
async function getAdidasOffers(query: string, limit: number): Promise<BloomOffer[]> {
  try {
    const response = await fetch(
      `https://www.adidas.com/api/plp/content-engine?sitePath=us&query=${encodeURIComponent(query)}`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      }
    );

    if (!response.ok) {
      console.error('Adidas API error:', response.status);
      return [];
    }

    const data = await response.json();
    const items = data.raw?.itemList?.items || [];

    return items.slice(0, limit).map((item: any) => {
      const price = item.salePrice || item.price || 0;
      return {
        offer_id: `adidas:${item.productId || item.modelId}`,
        catalog_item_id: null,
        title: item.displayName || item.name || 'Adidas Product',
        image: item.image?.src || item.images?.[0]?.src || null,
        price: price,
        total_estimate: price > 0 ? price + 10 : 0,
        currency: 'USD' as const,
        source: 'adidas',
        condition: 'new' as const,
        source_url: item.link ? `https://www.adidas.com${item.link}` : `https://www.adidas.com/us/search?q=${encodeURIComponent(query)}`,
        last_updated_at: new Date().toISOString(),
      };
    }).filter((o: BloomOffer) => o.title);
  } catch (e) {
    console.error('Adidas error:', e);
    return [];
  }
}

// ============ GOAT ADAPTER ============
async function getGoatOffers(query: string, limit: number): Promise<BloomOffer[]> {
  try {
    // GOAT uses Algolia for search - use product_templates for unique products
    const response = await fetch(
      'https://2fwotdvm2o-dsn.algolia.net/1/indexes/product_variants_v2_trending/query',
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
          facetFilters: [['product_category:shoes']],
          distinct: true,  // Get unique products, not variants
        }),
      }
    );

    if (!response.ok) {
      console.error('GOAT API error:', response.status);
      return [];
    }

    const data = await response.json();
    const hits = data.hits || [];

    // Dedupe by slug to avoid same shoe appearing multiple times
    const seen = new Set<string>();
    const uniqueHits = hits.filter((hit: any) => {
      const key = hit.slug || hit.product_template_id || hit.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return uniqueHits.map((hit: any) => {
      const price = hit.lowest_price_cents ? hit.lowest_price_cents / 100 :
                    (hit.retail_price_cents ? hit.retail_price_cents / 100 : 0);
      return {
        offer_id: `goat:${hit.slug || hit.id}`,
        catalog_item_id: null,
        title: hit.name || hit.product_title || 'GOAT Product',
        image: hit.main_picture_url || hit.grid_picture_url || null,
        price: price,
        total_estimate: price > 0 ? price * 1.10 + 15 : 0, // 10% fee + $15 ship
        currency: 'USD' as const,
        source: 'goat',
        condition: 'deadstock' as const,
        source_url: hit.slug ? `https://www.goat.com/sneakers/${hit.slug}` : `https://www.goat.com/search?query=${encodeURIComponent(query)}`,
        last_updated_at: new Date().toISOString(),
      };
    }).filter((o: BloomOffer) => o.title && o.price > 0);
  } catch (e) {
    console.error('GOAT error:', e);
    return [];
  }
}

// ============ EBAY ADAPTER ============
async function getEbayOffers(query: string, limit: number): Promise<BloomOffer[]> {
  const ebayAccessToken = Deno.env.get('EBAY_ACCESS_TOKEN');

  if (!ebayAccessToken) {
    console.log('eBay credentials not configured, skipping');
    return [];
  }

  try {
    const response = await fetch(
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
      }
    );

    if (!response.ok) {
      console.error('eBay API error:', response.status);
      return [];
    }

    const data = await response.json();
    const items = data.itemSummaries || [];

    return items.map((item: any) => {
      const price = parseFloat(item.price?.value || '0');
      const shipping = parseFloat(item.shippingOptions?.[0]?.shippingCost?.value || '0');

      return {
        offer_id: `ebay:${item.itemId}`,
        catalog_item_id: null,
        title: item.title,
        image: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl,
        price: price,
        total_estimate: price + shipping,
        currency: 'USD' as const,
        source: 'ebay',
        condition: item.condition?.toLowerCase() === 'new' ? 'new' as const : 'used' as const,
        source_url: item.itemWebUrl,
        last_updated_at: new Date().toISOString(),
      };
    }).filter((o: BloomOffer) => o.price > 0);
  } catch (e) {
    console.error('eBay error:', e);
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

      if (!source_filter) {
        // Fetch from ALL sources in parallel
        console.log(`[get-offers] Searching all sources for "${base_query}"...`);

        const [stockxOffers, nikeOffers, adidasOffers, goatOffers, ebayOffers] = await Promise.allSettled([
          getStockXOffers(supabase, base_query, limit),
          getNikeOffers(base_query, limit),
          getAdidasOffers(base_query, limit),
          getGoatOffers(base_query, limit),
          getEbayOffers(base_query, limit),
        ]);

        // Log results from each source
        console.log(`[get-offers] StockX: ${stockxOffers.status === 'fulfilled' ? stockxOffers.value.length : 'FAILED - ' + (stockxOffers as any).reason}`);
        console.log(`[get-offers] Nike: ${nikeOffers.status === 'fulfilled' ? nikeOffers.value.length : 'FAILED - ' + (nikeOffers as any).reason}`);
        console.log(`[get-offers] Adidas: ${adidasOffers.status === 'fulfilled' ? adidasOffers.value.length : 'FAILED - ' + (adidasOffers as any).reason}`);
        console.log(`[get-offers] GOAT: ${goatOffers.status === 'fulfilled' ? goatOffers.value.length : 'FAILED - ' + (goatOffers as any).reason}`);
        console.log(`[get-offers] eBay: ${ebayOffers.status === 'fulfilled' ? ebayOffers.value.length : 'FAILED - ' + (ebayOffers as any).reason}`);

        if (stockxOffers.status === 'fulfilled') allOffers.push(...stockxOffers.value);
        if (nikeOffers.status === 'fulfilled') allOffers.push(...nikeOffers.value);
        if (adidasOffers.status === 'fulfilled') allOffers.push(...adidasOffers.value);
        if (goatOffers.status === 'fulfilled') allOffers.push(...goatOffers.value);
        if (ebayOffers.status === 'fulfilled') allOffers.push(...ebayOffers.value);

        console.log(`[get-offers] Total offers: ${allOffers.length}`);
      } else {
        // Filter to specific source
        switch (source_filter) {
          case 'stockx':
            allOffers.push(...await getStockXOffers(supabase, base_query, limit));
            break;
          case 'nike':
            allOffers.push(...await getNikeOffers(base_query, limit));
            break;
          case 'adidas':
            allOffers.push(...await getAdidasOffers(base_query, limit));
            break;
          case 'goat':
            allOffers.push(...await getGoatOffers(base_query, limit));
            break;
          case 'ebay':
            allOffers.push(...await getEbayOffers(base_query, limit));
            break;
          default:
            allOffers.push(...await getStockXOffers(supabase, base_query, limit));
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
          sources_searched: source_filter ? [source_filter] : ['stockx', 'nike', 'adidas', 'goat', 'ebay'],
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
