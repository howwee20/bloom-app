// lib/offers/extractors/next_data.ts
// Next.js __NEXT_DATA__ Extractor
// Extracts product data from Next.js hydration JSON

import type {
  Offer,
  ExtractorResult,
  ProductSource,
  NextData,
} from '../types';
import { getTtlForMerchant } from '../types';

/**
 * Extract __NEXT_DATA__ JSON from HTML
 */
function findNextData(html: string): NextData | null {
  // Match <script id="__NEXT_DATA__" type="application/json">...</script>
  const regex = /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i;
  const match = regex.exec(html);

  if (!match) return null;

  try {
    return JSON.parse(match[1].trim());
  } catch {
    return null;
  }
}

/**
 * Deep search for product-like objects in nested data
 */
function findProductData(obj: unknown, depth: number = 0): Record<string, unknown> | null {
  if (depth > 10) return null; // Prevent infinite recursion
  if (!obj || typeof obj !== 'object') return null;

  // Check if this object looks like product data
  const record = obj as Record<string, unknown>;

  // Common patterns for product data
  if (
    (record.price !== undefined || record.retailPrice !== undefined || record.lowestPrice !== undefined) &&
    (record.name || record.title || record.productName)
  ) {
    return record;
  }

  // Common keys that contain product data
  const productKeys = ['product', 'productData', 'item', 'listing', 'pdp', 'pdpData'];

  for (const key of productKeys) {
    if (record[key] && typeof record[key] === 'object') {
      const found = findProductData(record[key], depth + 1);
      if (found) return found;
    }
  }

  // Recurse into nested objects
  for (const key of Object.keys(record)) {
    if (typeof record[key] === 'object' && record[key] !== null) {
      const found = findProductData(record[key], depth + 1);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Extract price from various field names
 */
function extractPrice(data: Record<string, unknown>): number | null {
  const priceFields = [
    'price',
    'lowestPrice',
    'retailPrice',
    'salePrice',
    'currentPrice',
    'listPrice',
    'amount',
  ];

  for (const field of priceFields) {
    const value = data[field];
    if (value !== undefined && value !== null) {
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        const parsed = parseFloat(value.replace(/[^0-9.]/g, ''));
        if (!isNaN(parsed)) return parsed;
      }
      // Nested price object
      if (typeof value === 'object' && value !== null) {
        const nested = value as Record<string, unknown>;
        if (typeof nested.amount === 'number') return nested.amount;
        if (typeof nested.value === 'number') return nested.value;
      }
    }
  }

  return null;
}

/**
 * Extract title from various field names
 */
function extractTitle(data: Record<string, unknown>): string | null {
  const titleFields = ['name', 'title', 'productName', 'displayName'];

  for (const field of titleFields) {
    const value = data[field];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }

  return null;
}

/**
 * Extract image URL from various field names
 */
function extractImage(data: Record<string, unknown>): string | null {
  const imageFields = ['image', 'imageUrl', 'thumbnail', 'mainImage', 'primaryImage'];

  for (const field of imageFields) {
    const value = data[field];
    if (typeof value === 'string' && value.startsWith('http')) {
      return value;
    }
    if (Array.isArray(value) && value.length > 0) {
      const first = value[0];
      if (typeof first === 'string') return first;
      if (typeof first === 'object' && first !== null) {
        const nested = first as Record<string, unknown>;
        if (typeof nested.url === 'string') return nested.url;
        if (typeof nested.src === 'string') return nested.src;
      }
    }
    if (typeof value === 'object' && value !== null) {
      const nested = value as Record<string, unknown>;
      if (typeof nested.url === 'string') return nested.url;
      if (typeof nested.src === 'string') return nested.src;
    }
  }

  return null;
}

/**
 * Main extraction function for __NEXT_DATA__
 */
export async function extractNextData(
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
        adapterUsed: 'next_data',
      };
    }

    // Find __NEXT_DATA__
    const nextData = findNextData(pageHtml);

    if (!nextData) {
      return {
        success: false,
        error: 'No __NEXT_DATA__ found on page',
        adapterUsed: 'next_data',
      };
    }

    // Search for product data in pageProps
    const productData = findProductData(nextData.props?.pageProps);

    if (!productData) {
      return {
        success: false,
        error: 'No product data found in __NEXT_DATA__',
        rawData: nextData as any,
        adapterUsed: 'next_data',
      };
    }

    // Extract fields
    const price = extractPrice(productData);
    if (price === null) {
      return {
        success: false,
        error: 'Could not extract price from __NEXT_DATA__',
        rawData: productData,
        adapterUsed: 'next_data',
      };
    }

    const title = extractTitle(productData);
    const imageUrl = extractImage(productData);

    const ttl = getTtlForMerchant(merchant);
    const now = new Date();

    const offer: Offer = {
      productId: productId,
      styleCode: styleCode,
      merchant: merchant,
      price: price,
      currency: 'USD',
      inStock: true, // __NEXT_DATA__ usually doesn't have availability
      sizes: null,
      imageUrl: imageUrl,
      productUrl: url,
      condition: 'new',
      title: title,
      fetchedAt: now,
      expiresAt: new Date(now.getTime() + ttl * 60 * 1000),
      sourceId: source.id,
    };

    return {
      success: true,
      offer,
      rawData: productData,
      adapterUsed: 'next_data',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      adapterUsed: 'next_data',
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
      },
    });

    clearTimeout(timeout);

    if (!response.ok) return null;

    return await response.text();
  } catch {
    return null;
  }
}

/**
 * Quick check if a page has __NEXT_DATA__
 */
export function hasNextData(html: string): boolean {
  return html.includes('__NEXT_DATA__');
}
