// lib/offers/fetch_offer.ts
// Offer Fetch Orchestrator
// Coordinates extraction across multiple adapters

import type {
  Offer,
  ExtractorResult,
  ProductSource,
  AdapterType,
} from './types';
import { extractJsonLd, hasJsonLdData } from './extractors/jsonld';
import { extractShopify } from './extractors/shopify';
import { extractNextData, hasNextData } from './extractors/next_data';

/**
 * Extraction strategy by adapter type
 */
const EXTRACTORS: Record<AdapterType, (source: ProductSource, html?: string) => Promise<ExtractorResult>> = {
  jsonld: extractJsonLd,
  shopify: extractShopify,
  next_data: extractNextData,
  api: async (source) => ({
    success: false,
    error: 'API adapter requires custom implementation per merchant',
    adapterUsed: 'api',
  }),
  playwright: async (source) => ({
    success: false,
    error: 'Playwright adapter not implemented (browser required)',
    adapterUsed: 'playwright',
  }),
};

/**
 * Attempt extraction with fallback chain
 * Order: Specified adapter -> JSON-LD -> Next.js data -> Shopify
 */
export async function fetchOffer(source: ProductSource): Promise<ExtractorResult> {
  const { adapterType, url } = source;

  console.log(`[FetchOffer] Extracting from ${url} using ${adapterType}`);

  // Try the specified adapter first
  if (adapterType !== 'playwright' && adapterType !== 'api') {
    const result = await EXTRACTORS[adapterType](source);
    if (result.success) {
      console.log(`[FetchOffer] Success with ${adapterType}: $${result.offer?.price}`);
      return result;
    }
    console.log(`[FetchOffer] ${adapterType} failed: ${result.error}`);
  }

  // Fallback chain for web pages
  // Fetch HTML once, try multiple extractors
  const html = await fetchHtml(url);

  if (!html) {
    return {
      success: false,
      error: 'Failed to fetch page HTML for fallback extraction',
      adapterUsed: adapterType,
    };
  }

  // Try JSON-LD if present
  if (hasJsonLdData(html) && adapterType !== 'jsonld') {
    console.log('[FetchOffer] Trying JSON-LD fallback...');
    const result = await extractJsonLd(source, html);
    if (result.success) {
      console.log(`[FetchOffer] JSON-LD fallback success: $${result.offer?.price}`);
      return result;
    }
  }

  // Try __NEXT_DATA__ if present
  if (hasNextData(html) && adapterType !== 'next_data') {
    console.log('[FetchOffer] Trying __NEXT_DATA__ fallback...');
    const result = await extractNextData(source, html);
    if (result.success) {
      console.log(`[FetchOffer] __NEXT_DATA__ fallback success: $${result.offer?.price}`);
      return result;
    }
  }

  // No extraction succeeded
  return {
    success: false,
    error: 'All extraction methods failed',
    adapterUsed: adapterType,
  };
}

/**
 * Fetch offers from multiple sources in parallel
 * Uses p-limit style concurrency control
 */
export async function fetchOffersParallel(
  sources: ProductSource[],
  concurrency: number = 5
): Promise<Map<string, ExtractorResult>> {
  const results = new Map<string, ExtractorResult>();

  // Simple chunked parallel execution
  for (let i = 0; i < sources.length; i += concurrency) {
    const chunk = sources.slice(i, i + concurrency);
    const chunkResults = await Promise.allSettled(
      chunk.map(source => fetchOffer(source))
    );

    chunkResults.forEach((result, index) => {
      const source = chunk[index];
      if (result.status === 'fulfilled') {
        results.set(source.id, result.value);
      } else {
        results.set(source.id, {
          success: false,
          error: result.reason?.message || 'Unknown error',
          adapterUsed: source.adapterType,
        });
      }
    });
  }

  return results;
}

/**
 * Detect best adapter type for a URL
 * (For auto-discovery)
 */
export async function detectAdapterType(url: string): Promise<AdapterType | null> {
  const html = await fetchHtml(url);
  if (!html) return null;

  // Check for Shopify indicators
  if (
    html.includes('cdn.shopify.com') ||
    html.includes('Shopify.theme') ||
    url.includes('/products/')
  ) {
    // Verify by checking if .json endpoint works
    try {
      const jsonUrl = url.endsWith('.json') ? url : url + '.json';
      const response = await fetch(jsonUrl, { method: 'HEAD' });
      if (response.ok) return 'shopify';
    } catch {
      // Not Shopify
    }
  }

  // Check for JSON-LD
  if (hasJsonLdData(html)) {
    return 'jsonld';
  }

  // Check for Next.js
  if (hasNextData(html)) {
    return 'next_data';
  }

  // Default to JSON-LD (most common for retail sites)
  return 'jsonld';
}

/**
 * Fetch HTML from URL with timeout
 */
async function fetchHtml(url: string, timeoutMs: number = 10000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.log(`[FetchOffer] Failed to fetch ${url}: ${response.status}`);
      return null;
    }

    return await response.text();
  } catch (error) {
    console.log(`[FetchOffer] Fetch error for ${url}:`, error);
    return null;
  }
}

/**
 * Filter successful offers from results
 */
export function getSuccessfulOffers(results: Map<string, ExtractorResult>): Offer[] {
  const offers: Offer[] = [];

  for (const result of results.values()) {
    if (result.success && result.offer) {
      offers.push(result.offer);
    }
  }

  return offers.sort((a, b) => a.price - b.price);
}
