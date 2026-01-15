// lib/offers/types.ts
// Type definitions for the permissionless offer indexing system

/**
 * Adapter types for extracting offers from merchant pages
 */
export type AdapterType = 'jsonld' | 'next_data' | 'shopify' | 'api' | 'playwright';

/**
 * Product condition
 */
export type ProductCondition = 'new' | 'used' | 'deadstock';

/**
 * A product source links a product to a merchant page
 * This is the "link graph" - mapping style codes to URLs
 */
export interface ProductSource {
  id: string;
  productId: string | null;
  styleCode: string;
  merchant: string;
  url: string;
  adapterType: AdapterType;
  confidence: number;
  lastVerifiedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Size availability info
 */
export interface SizeInfo {
  size: string;
  available: boolean;
  price?: number;
}

/**
 * An extracted offer from a merchant
 * This is what we cache in the offers table
 */
export interface Offer {
  id?: string;
  productId: string | null;
  styleCode: string;
  merchant: string;
  price: number;
  currency: string;
  inStock: boolean;
  sizes: SizeInfo[] | null;
  imageUrl: string | null;
  productUrl: string;
  condition: ProductCondition;
  title: string | null;
  fetchedAt: Date;
  expiresAt: Date;
  sourceId?: string;
  isStale?: boolean;
}

/**
 * Raw extracted data before normalization
 */
export interface RawOfferData {
  price?: number | string;
  currency?: string;
  availability?: string | boolean;
  name?: string;
  image?: string | string[];
  url?: string;
  sku?: string;
  brand?: string;
  offers?: RawOfferData | RawOfferData[];
}

/**
 * JSON-LD Product schema (Schema.org)
 */
export interface JsonLdProduct {
  '@type': 'Product' | string;
  '@context'?: string;
  name?: string;
  image?: string | string[];
  description?: string;
  sku?: string;
  brand?: {
    '@type'?: string;
    name?: string;
  } | string;
  offers?: JsonLdOffer | JsonLdOffer[];
}

/**
 * JSON-LD Offer schema (Schema.org)
 */
export interface JsonLdOffer {
  '@type': 'Offer' | 'AggregateOffer' | string;
  price?: number | string;
  priceCurrency?: string;
  availability?: string;
  url?: string;
  lowPrice?: number | string;
  highPrice?: number | string;
  offerCount?: number;
}

/**
 * Shopify product.json response
 */
export interface ShopifyProduct {
  product: {
    id: number;
    title: string;
    handle: string;
    vendor: string;
    product_type: string;
    images: Array<{
      id: number;
      src: string;
    }>;
    variants: Array<{
      id: number;
      title: string;
      price: string;
      available: boolean;
      sku: string;
    }>;
  };
}

/**
 * Next.js __NEXT_DATA__ structure
 */
export interface NextData {
  props: {
    pageProps?: Record<string, unknown>;
    initialState?: Record<string, unknown>;
  };
  page: string;
  query: Record<string, string>;
}

/**
 * Result from an extractor
 */
export interface ExtractorResult {
  success: boolean;
  offer?: Offer;
  rawData?: RawOfferData;
  error?: string;
  adapterUsed: AdapterType;
}

/**
 * TTL configuration per merchant type
 */
export const MERCHANT_TTL: Record<string, number> = {
  // Retail sites - prices change less frequently
  nike: 60,
  adidas: 60,
  footlocker: 60,
  finishline: 60,

  // Marketplaces - prices change frequently
  stockx: 15,
  goat: 15,

  // Resale - moderate refresh
  grailed: 30,
  ebay: 30,

  // Default
  default: 30,
};

/**
 * Get TTL for a merchant
 */
export function getTtlForMerchant(merchant: string): number {
  return MERCHANT_TTL[merchant.toLowerCase()] ?? MERCHANT_TTL.default;
}

/**
 * Known merchants and their base URLs
 */
export const MERCHANT_DOMAINS: Record<string, string[]> = {
  nike: ['nike.com', 'store.nike.com'],
  adidas: ['adidas.com', 'adidas.co.uk'],
  stockx: ['stockx.com'],
  goat: ['goat.com'],
  grailed: ['grailed.com'],
  ebay: ['ebay.com', 'ebay.co.uk'],
  footlocker: ['footlocker.com', 'footlocker.co.uk'],
  finishline: ['finishline.com'],
  jdsports: ['jdsports.com', 'jdsports.co.uk'],
};

/**
 * Identify merchant from URL
 */
export function identifyMerchant(url: string): string | null {
  const hostname = new URL(url).hostname.toLowerCase();

  for (const [merchant, domains] of Object.entries(MERCHANT_DOMAINS)) {
    if (domains.some(d => hostname.includes(d))) {
      return merchant;
    }
  }

  return null;
}
