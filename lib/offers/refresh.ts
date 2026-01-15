// lib/offers/refresh.ts
// Offer Refresh Orchestrator
// Handles background refresh of cached offers

import type {
  Offer,
  ProductSource,
  AdapterType,
} from './types';
import { getTtlForMerchant } from './types';
import { fetchOffer, fetchOffersParallel, getSuccessfulOffers } from './fetch_offer';

/**
 * Supabase client type (to avoid import issues in different contexts)
 */
interface SupabaseClient {
  from: (table: string) => {
    select: (columns: string) => any;
    insert: (data: any) => any;
    update: (data: any) => any;
    upsert: (data: any) => any;
    delete: () => any;
  };
  rpc: (fn: string, params?: any) => any;
}

/**
 * Load product sources for a product
 */
async function loadProductSources(
  supabase: SupabaseClient,
  productId?: string,
  styleCode?: string
): Promise<ProductSource[]> {
  let query = supabase
    .from('product_sources')
    .select('*');

  if (productId) {
    query = query.eq('product_id', productId);
  } else if (styleCode) {
    query = query.eq('style_code', styleCode);
  } else {
    return [];
  }

  const { data, error } = await query;

  if (error) {
    console.error('[Refresh] Failed to load product sources:', error);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    productId: row.product_id,
    styleCode: row.style_code,
    merchant: row.merchant,
    url: row.url,
    adapterType: row.adapter_type as AdapterType,
    confidence: row.confidence,
    lastVerifiedAt: row.last_verified_at ? new Date(row.last_verified_at) : null,
    lastError: row.last_error,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }));
}

/**
 * Save an offer to the database
 */
async function saveOffer(
  supabase: SupabaseClient,
  offer: Offer
): Promise<string | null> {
  const ttl = getTtlForMerchant(offer.merchant);

  const { data, error } = await supabase.rpc('upsert_offer', {
    p_product_id: offer.productId,
    p_style_code: offer.styleCode,
    p_merchant: offer.merchant,
    p_price: offer.price,
    p_product_url: offer.productUrl,
    p_image_url: offer.imageUrl,
    p_title: offer.title,
    p_sizes: offer.sizes,
    p_condition: offer.condition,
    p_ttl_minutes: ttl,
  });

  if (error) {
    console.error('[Refresh] Failed to save offer:', error);
    return null;
  }

  return data;
}

/**
 * Update product source with error info
 */
async function updateSourceError(
  supabase: SupabaseClient,
  sourceId: string,
  error: string
): Promise<void> {
  await supabase
    .from('product_sources')
    .update({ last_error: error })
    .eq('id', sourceId);
}

/**
 * Update product source as verified
 */
async function updateSourceVerified(
  supabase: SupabaseClient,
  sourceId: string
): Promise<void> {
  await supabase
    .from('product_sources')
    .update({
      last_verified_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('id', sourceId);
}

/**
 * Refresh offers for a single product
 * This is the main entry point for background refresh
 */
export async function refreshOffersForProduct(
  supabase: SupabaseClient,
  options: {
    productId?: string;
    styleCode?: string;
    concurrency?: number;
  }
): Promise<{
  refreshed: number;
  failed: number;
  offers: Offer[];
}> {
  const { productId, styleCode, concurrency = 5 } = options;

  console.log(`[Refresh] Starting refresh for product=${productId}, style=${styleCode}`);

  // Load sources
  const sources = await loadProductSources(supabase, productId, styleCode);

  if (sources.length === 0) {
    console.log('[Refresh] No sources found for product');
    return { refreshed: 0, failed: 0, offers: [] };
  }

  console.log(`[Refresh] Found ${sources.length} sources to refresh`);

  // Fetch offers in parallel
  const results = await fetchOffersParallel(sources, concurrency);

  // Process results
  let refreshed = 0;
  let failed = 0;
  const offers: Offer[] = [];

  for (const source of sources) {
    const result = results.get(source.id);

    if (!result) {
      failed++;
      continue;
    }

    if (result.success && result.offer) {
      // Save to database
      const savedId = await saveOffer(supabase, result.offer);

      if (savedId) {
        refreshed++;
        offers.push({ ...result.offer, id: savedId });
        await updateSourceVerified(supabase, source.id);
      } else {
        failed++;
      }
    } else {
      failed++;
      if (result.error) {
        await updateSourceError(supabase, source.id, result.error);
      }
    }
  }

  console.log(`[Refresh] Completed: ${refreshed} refreshed, ${failed} failed`);

  return {
    refreshed,
    failed,
    offers: offers.sort((a, b) => a.price - b.price),
  };
}

/**
 * Get cached offers for a product (fast path)
 */
export async function getCachedOffers(
  supabase: SupabaseClient,
  options: {
    productId?: string;
    styleCode?: string;
    includeExpired?: boolean;
  }
): Promise<{
  offers: Offer[];
  allStale: boolean;
  hasOffers: boolean;
}> {
  const { productId, styleCode, includeExpired = false } = options;

  const { data, error } = await supabase.rpc('get_offers_for_product', {
    p_product_id: productId || null,
    p_style_code: styleCode || null,
    p_include_expired: includeExpired,
  });

  if (error) {
    console.error('[Refresh] Failed to get cached offers:', error);
    return { offers: [], allStale: true, hasOffers: false };
  }

  const offers: Offer[] = (data || []).map((row: any) => ({
    id: row.id,
    productId: productId || null,
    styleCode: styleCode || '',
    merchant: row.merchant,
    price: Number(row.price),
    currency: row.currency,
    inStock: row.in_stock,
    sizes: row.sizes,
    imageUrl: row.image_url,
    productUrl: row.product_url,
    condition: row.condition,
    title: row.title,
    fetchedAt: new Date(row.fetched_at),
    expiresAt: new Date(), // Not returned from RPC
    isStale: row.is_stale,
  }));

  const hasOffers = offers.length > 0;
  const allStale = hasOffers && offers.every(o => o.isStale);

  return { offers, allStale, hasOffers };
}

/**
 * Refresh offers if stale, otherwise return cached
 * This is the smart entry point that combines cache check + refresh
 */
export async function getOffersWithRefresh(
  supabase: SupabaseClient,
  options: {
    productId?: string;
    styleCode?: string;
    forceRefresh?: boolean;
  }
): Promise<{
  offers: Offer[];
  fromCache: boolean;
  refreshTriggered: boolean;
}> {
  const { productId, styleCode, forceRefresh = false } = options;

  // Check cache first
  const cached = await getCachedOffers(supabase, { productId, styleCode });

  // If we have fresh offers and not forcing refresh, return them
  if (cached.hasOffers && !cached.allStale && !forceRefresh) {
    return {
      offers: cached.offers,
      fromCache: true,
      refreshTriggered: false,
    };
  }

  // Need to refresh
  const refreshResult = await refreshOffersForProduct(supabase, {
    productId,
    styleCode,
  });

  if (refreshResult.offers.length > 0) {
    return {
      offers: refreshResult.offers,
      fromCache: false,
      refreshTriggered: true,
    };
  }

  // Refresh failed, return stale data if we have it
  if (cached.hasOffers) {
    return {
      offers: cached.offers,
      fromCache: true,
      refreshTriggered: true,
    };
  }

  return {
    offers: [],
    fromCache: false,
    refreshTriggered: true,
  };
}

/**
 * Add a new product source
 */
export async function addProductSource(
  supabase: SupabaseClient,
  source: {
    productId?: string;
    styleCode: string;
    merchant: string;
    url: string;
    adapterType: AdapterType;
    confidence?: number;
  }
): Promise<string | null> {
  const { data, error } = await supabase
    .from('product_sources')
    .insert({
      product_id: source.productId,
      style_code: source.styleCode,
      merchant: source.merchant,
      url: source.url,
      adapter_type: source.adapterType,
      confidence: source.confidence ?? 1.0,
    })
    .select('id')
    .single();

  if (error) {
    // Might be duplicate, that's OK
    if (error.code === '23505') {
      console.log('[Refresh] Source already exists');
      return null;
    }
    console.error('[Refresh] Failed to add source:', error);
    return null;
  }

  return data?.id;
}
