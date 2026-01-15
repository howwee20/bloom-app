// lib/offers/extractors/jsonld.ts
// JSON-LD Structured Data Extractor
// Extracts product/offer data from <script type="application/ld+json"> tags

import type {
  Offer,
  JsonLdProduct,
  JsonLdOffer,
  ExtractorResult,
  ProductSource,
  SizeInfo,
} from '../types';
import { getTtlForMerchant } from '../types';

/**
 * Parse price from various formats
 */
function parsePrice(price: string | number | undefined): number | null {
  if (price === undefined || price === null) return null;

  if (typeof price === 'number') return price;

  // Remove currency symbols and commas
  const cleaned = price.toString().replace(/[^0-9.]/g, '');
  const parsed = parseFloat(cleaned);

  return isNaN(parsed) ? null : parsed;
}

/**
 * Parse availability from Schema.org format
 */
function parseAvailability(availability: string | boolean | undefined): boolean {
  if (typeof availability === 'boolean') return availability;
  if (!availability) return true; // Assume in stock if not specified

  const lower = availability.toLowerCase();

  // Schema.org availability values
  if (lower.includes('instock') || lower.includes('in_stock')) return true;
  if (lower.includes('outofstock') || lower.includes('out_of_stock')) return false;
  if (lower.includes('preorder')) return true;
  if (lower.includes('discontinued')) return false;

  return true;
}

/**
 * Extract first image from image field
 */
function extractImage(image: string | string[] | undefined): string | null {
  if (!image) return null;
  if (typeof image === 'string') return image;
  if (Array.isArray(image) && image.length > 0) return image[0];
  return null;
}

/**
 * Extract product data from JSON-LD Product schema
 */
function extractFromProduct(product: JsonLdProduct, url: string): Partial<Offer> | null {
  const result: Partial<Offer> = {
    title: product.name || null,
    imageUrl: extractImage(product.image),
    productUrl: url,
  };

  // Handle offers - can be single offer or array
  const offers = product.offers;
  if (!offers) return result;

  let offerData: JsonLdOffer;

  if (Array.isArray(offers)) {
    // Use first offer or find lowest price
    if (offers.length === 0) return result;

    // Find lowest price offer
    let lowestPrice = Infinity;
    let lowestOffer = offers[0];

    for (const o of offers) {
      const price = parsePrice(o.price || o.lowPrice);
      if (price !== null && price < lowestPrice) {
        lowestPrice = price;
        lowestOffer = o;
      }
    }

    offerData = lowestOffer;
  } else {
    offerData = offers;
  }

  // Handle AggregateOffer (price range)
  if (offerData['@type'] === 'AggregateOffer') {
    result.price = parsePrice(offerData.lowPrice || offerData.price) ?? undefined;
  } else {
    result.price = parsePrice(offerData.price) ?? undefined;
  }

  result.currency = offerData.priceCurrency || 'USD';
  result.inStock = parseAvailability(offerData.availability);

  if (offerData.url) {
    result.productUrl = offerData.url;
  }

  return result;
}

/**
 * Find JSON-LD scripts in HTML and extract products
 */
function findJsonLdProducts(html: string): JsonLdProduct[] {
  const products: JsonLdProduct[] = [];

  // Regex to find <script type="application/ld+json">...</script>
  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const jsonText = match[1].trim();
      const data = JSON.parse(jsonText);

      // Handle array of items (common pattern)
      const items = Array.isArray(data) ? data : [data];

      for (const item of items) {
        if (item['@type'] === 'Product') {
          products.push(item as JsonLdProduct);
        }
        // Handle @graph pattern
        if (item['@graph'] && Array.isArray(item['@graph'])) {
          for (const graphItem of item['@graph']) {
            if (graphItem['@type'] === 'Product') {
              products.push(graphItem as JsonLdProduct);
            }
          }
        }
      }
    } catch (e) {
      // Skip invalid JSON
      console.log('[JSON-LD] Failed to parse JSON-LD block:', e);
    }
  }

  return products;
}

/**
 * Main extraction function for JSON-LD
 */
export async function extractJsonLd(
  source: ProductSource,
  html?: string
): Promise<ExtractorResult> {
  const { url, styleCode, merchant, productId } = source;

  try {
    // Fetch HTML if not provided
    const pageHtml = html ?? await fetchHtml(url);

    if (!pageHtml) {
      return {
        success: false,
        error: 'Failed to fetch page HTML',
        adapterUsed: 'jsonld',
      };
    }

    // Find all JSON-LD Product blocks
    const products = findJsonLdProducts(pageHtml);

    if (products.length === 0) {
      return {
        success: false,
        error: 'No JSON-LD Product data found on page',
        adapterUsed: 'jsonld',
      };
    }

    // Extract from first product (usually the main one)
    const extracted = extractFromProduct(products[0], url);

    if (!extracted || extracted.price === undefined) {
      return {
        success: false,
        error: 'Could not extract price from JSON-LD',
        rawData: products[0] as any,
        adapterUsed: 'jsonld',
      };
    }

    const ttl = getTtlForMerchant(merchant);
    const now = new Date();

    const offer: Offer = {
      productId: productId,
      styleCode: styleCode,
      merchant: merchant,
      price: extracted.price!,
      currency: extracted.currency || 'USD',
      inStock: extracted.inStock ?? true,
      sizes: null, // JSON-LD usually doesn't have size-level data
      imageUrl: extracted.imageUrl,
      productUrl: extracted.productUrl || url,
      condition: 'new',
      title: extracted.title,
      fetchedAt: now,
      expiresAt: new Date(now.getTime() + ttl * 60 * 1000),
      sourceId: source.id,
    };

    return {
      success: true,
      offer,
      rawData: products[0] as any,
      adapterUsed: 'jsonld',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      adapterUsed: 'jsonld',
    };
  }
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
      console.log(`[JSON-LD] Failed to fetch ${url}: ${response.status}`);
      return null;
    }

    return await response.text();
  } catch (error) {
    console.log(`[JSON-LD] Fetch error for ${url}:`, error);
    return null;
  }
}

/**
 * Quick check if a page likely has JSON-LD data
 * (For pre-filtering without full extraction)
 */
export function hasJsonLdData(html: string): boolean {
  return html.includes('application/ld+json');
}
