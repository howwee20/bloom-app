// lib/offers/extractors/shopify.ts
// Shopify Product Extractor
// Uses the public .json endpoint that Shopify stores expose

import type {
  Offer,
  ExtractorResult,
  ProductSource,
  SizeInfo,
  ShopifyProduct,
} from '../types';
import { getTtlForMerchant } from '../types';

/**
 * Convert Shopify product URL to .json URL
 * e.g., /products/air-jordan-1 -> /products/air-jordan-1.json
 */
function getJsonUrl(url: string): string {
  const parsed = new URL(url);
  let pathname = parsed.pathname;

  // Remove trailing slash
  if (pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  // Add .json if not already present
  if (!pathname.endsWith('.json')) {
    pathname = pathname + '.json';
  }

  parsed.pathname = pathname;
  return parsed.toString();
}

/**
 * Parse variant sizes from Shopify response
 */
function parseVariants(variants: ShopifyProduct['product']['variants']): SizeInfo[] {
  return variants.map(v => ({
    size: v.title,
    available: v.available,
    price: parseFloat(v.price),
  }));
}

/**
 * Get lowest price from variants
 */
function getLowestPrice(variants: ShopifyProduct['product']['variants']): number | null {
  const availablePrices = variants
    .filter(v => v.available)
    .map(v => parseFloat(v.price));

  if (availablePrices.length === 0) {
    // No available variants, use any price
    const allPrices = variants.map(v => parseFloat(v.price));
    if (allPrices.length === 0) return null;
    return Math.min(...allPrices);
  }

  return Math.min(...availablePrices);
}

/**
 * Check if any variant is available
 */
function hasAvailability(variants: ShopifyProduct['product']['variants']): boolean {
  return variants.some(v => v.available);
}

/**
 * Main extraction function for Shopify
 */
export async function extractShopify(
  source: ProductSource
): Promise<ExtractorResult> {
  const { url, styleCode, merchant, productId } = source;

  try {
    const jsonUrl = getJsonUrl(url);
    console.log(`[Shopify] Fetching ${jsonUrl}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(jsonUrl, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return {
        success: false,
        error: `Shopify .json returned ${response.status}`,
        adapterUsed: 'shopify',
      };
    }

    const data = await response.json() as ShopifyProduct;

    if (!data.product) {
      return {
        success: false,
        error: 'No product data in Shopify response',
        adapterUsed: 'shopify',
      };
    }

    const { product } = data;

    // Get pricing
    const price = getLowestPrice(product.variants);
    if (price === null) {
      return {
        success: false,
        error: 'No valid price in Shopify variants',
        rawData: data as any,
        adapterUsed: 'shopify',
      };
    }

    // Get sizes
    const sizes = parseVariants(product.variants);

    // Get image
    const imageUrl = product.images?.[0]?.src || null;

    const ttl = getTtlForMerchant(merchant);
    const now = new Date();

    const offer: Offer = {
      productId: productId,
      styleCode: styleCode,
      merchant: merchant,
      price: price,
      currency: 'USD', // Shopify .json doesn't include currency, assume USD
      inStock: hasAvailability(product.variants),
      sizes: sizes,
      imageUrl: imageUrl,
      productUrl: url,
      condition: 'new',
      title: product.title,
      fetchedAt: now,
      expiresAt: new Date(now.getTime() + ttl * 60 * 1000),
      sourceId: source.id,
    };

    return {
      success: true,
      offer,
      rawData: data as any,
      adapterUsed: 'shopify',
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';

    // Check for AbortError (timeout)
    if (errorMsg.includes('abort') || error instanceof DOMException) {
      return {
        success: false,
        error: 'Request timed out',
        adapterUsed: 'shopify',
      };
    }

    return {
      success: false,
      error: errorMsg,
      adapterUsed: 'shopify',
    };
  }
}

/**
 * Check if a URL is likely a Shopify store
 * (Useful for link discovery)
 */
export async function isShopifyStore(baseUrl: string): Promise<boolean> {
  try {
    // Try to fetch /products.json which is a Shopify-specific endpoint
    const url = new URL('/products.json?limit=1', baseUrl);

    const response = await fetch(url.toString(), {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });

    // Shopify stores return 200 or 401 (requires auth) for this endpoint
    return response.ok || response.status === 401;
  } catch {
    return false;
  }
}

/**
 * Discover product URLs from Shopify store
 * (For link discovery phase)
 */
export async function discoverShopifyProducts(
  baseUrl: string,
  limit: number = 250
): Promise<string[]> {
  const products: string[] = [];

  try {
    const url = new URL('/products.json', baseUrl);
    url.searchParams.set('limit', limit.toString());

    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!response.ok) {
      console.log(`[Shopify] Products discovery failed: ${response.status}`);
      return [];
    }

    const data = await response.json();

    if (data.products && Array.isArray(data.products)) {
      for (const product of data.products) {
        if (product.handle) {
          products.push(`${baseUrl}/products/${product.handle}`);
        }
      }
    }
  } catch (error) {
    console.log('[Shopify] Discovery error:', error);
  }

  return products;
}
