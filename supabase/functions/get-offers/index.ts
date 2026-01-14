// supabase/functions/get-offers/index.ts
// Unified Market Index - Multi-source price aggregation
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// BloomOffer - normalized offer from any source
interface BloomOffer {
  offer_id: string;              // "${source}:${listing_id}"
  catalog_item_id: string | null;
  title: string;
  image: string | null;
  price: number;                 // Base item price
  total_estimate: number;        // Price + fees + shipping
  currency: 'USD';
  source: string;
  condition: 'new' | 'used' | 'deadstock';
  size_options?: string[];
  source_url: string;            // Clickable link for manual purchase
  last_updated_at: string;
}

// Query parser - extracts source filter from query
function parseQuery(query: string): { base_query: string; source_filter: string | null } {
  const sources = ['stockx', 'ebay', 'goat', 'adidas', 'nike', 'grailed', 'poshmark'];
  const words = query.toLowerCase().trim().split(/\s+/);
  const lastWord = words[words.length - 1];

  if (sources.includes(lastWord)) {
    return {
      base_query: words.slice(0, -1).join(' ') || lastWord, // If only source word, use it as query
      source_filter: lastWord,
    };
  }

  return { base_query: query.trim(), source_filter: null };
}

// StockX adapter - uses existing catalog/price data
async function getStockXOffers(
  supabase: any,
  query: string,
  limit: number
): Promise<BloomOffer[]> {
  const STOCKX_FEE_RATE = 0.12;
  const STOCKX_SHIPPING = 14;

  // Search catalog items
  const { data: items, error } = await supabase.rpc('search_catalog_items', {
    q: query,
    limit_n: limit,
  });

  if (error || !items) {
    console.error('StockX adapter error:', error);
    return [];
  }

  // Map to BloomOffer format
  return items.map((item: any) => {
    const price = item.lowest_price || 0;
    const fees = Math.round(price * STOCKX_FEE_RATE * 100) / 100;
    const total = price + fees + STOCKX_SHIPPING;

    return {
      offer_id: `stockx:${item.id}`,
      catalog_item_id: item.id,
      title: item.display_name,
      image: item.image_url_thumb,
      price: price,
      total_estimate: total,
      currency: 'USD',
      source: 'stockx',
      condition: 'deadstock' as const,
      source_url: `https://stockx.com/search?s=${encodeURIComponent(item.display_name)}`,
      last_updated_at: new Date().toISOString(),
    };
  }).filter((offer: BloomOffer) => offer.price > 0);
}

// eBay adapter - placeholder (requires API keys)
async function getEbayOffers(
  query: string,
  limit: number
): Promise<BloomOffer[]> {
  const ebayAppId = Deno.env.get('EBAY_APP_ID');
  const ebayAccessToken = Deno.env.get('EBAY_ACCESS_TOKEN');

  // If no eBay credentials, return empty
  if (!ebayAppId || !ebayAccessToken) {
    console.log('eBay credentials not configured, skipping');
    return [];
  }

  try {
    // eBay Browse API
    const response = await fetch(
      `https://api.ebay.com/buy/browse/v1/item_summary/search?` +
      `q=${encodeURIComponent(query)}` +
      `&filter=buyingOptions:{FIXED_PRICE}` +
      `&category_ids=93427` + // Athletic shoes
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
      // eBay fees are typically ~13% for buyer
      const fees = Math.round(price * 0.13 * 100) / 100;
      const shipping = parseFloat(item.shippingOptions?.[0]?.shippingCost?.value || '0');

      return {
        offer_id: `ebay:${item.itemId}`,
        catalog_item_id: null, // eBay items not linked to our catalog
        title: item.title,
        image: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl,
        price: price,
        total_estimate: price + fees + shipping,
        currency: 'USD',
        source: 'ebay',
        condition: item.condition?.toLowerCase() === 'new' ? 'new' : 'used',
        source_url: item.itemWebUrl,
        last_updated_at: new Date().toISOString(),
      };
    }).filter((offer: BloomOffer) => offer.price > 0);

  } catch (error) {
    console.error('eBay adapter error:', error);
    return [];
  }
}

// GOAT adapter - placeholder
async function getGoatOffers(
  query: string,
  limit: number
): Promise<BloomOffer[]> {
  // GOAT doesn't have an official API
  // Future: implement scraping or unofficial API
  console.log('GOAT adapter not yet implemented');
  return [];
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const url = new URL(req.url);

  try {
    // GET /get-offers?q=<query>&limit=20
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

      // Parse query for source filter
      const { base_query, source_filter } = parseQuery(query);

      // Initialize Supabase client
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Collect offers from all sources (or filtered source)
      const allOffers: BloomOffer[] = [];

      // Run adapters in parallel if no filter
      if (!source_filter) {
        const [stockxOffers, ebayOffers, goatOffers] = await Promise.allSettled([
          getStockXOffers(supabase, base_query, limit),
          getEbayOffers(base_query, limit),
          getGoatOffers(base_query, limit),
        ]);

        if (stockxOffers.status === 'fulfilled') allOffers.push(...stockxOffers.value);
        if (ebayOffers.status === 'fulfilled') allOffers.push(...ebayOffers.value);
        if (goatOffers.status === 'fulfilled') allOffers.push(...goatOffers.value);
      } else {
        // Filtered to specific source
        switch (source_filter) {
          case 'stockx':
            allOffers.push(...await getStockXOffers(supabase, base_query, limit));
            break;
          case 'ebay':
            allOffers.push(...await getEbayOffers(base_query, limit));
            break;
          case 'goat':
            allOffers.push(...await getGoatOffers(base_query, limit));
            break;
          default:
            // Unknown source, fall back to StockX
            allOffers.push(...await getStockXOffers(supabase, base_query, limit));
        }
      }

      // Sort by total_estimate (cheapest first)
      allOffers.sort((a, b) => a.total_estimate - b.total_estimate);

      return new Response(
        JSON.stringify({
          query: base_query,
          source_filter,
          offers: allOffers.slice(0, limit),
          sources_searched: source_filter ? [source_filter] : ['stockx', 'ebay', 'goat'],
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
