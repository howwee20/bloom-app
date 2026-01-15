// lib/offers/index.ts
// Permissionless Offer Indexing System
// "Backrub for Commerce" - Separate indexing from querying

// Type exports
export type {
  Offer,
  ProductSource,
  SizeInfo,
  AdapterType,
  ProductCondition,
  ExtractorResult,
  RawOfferData,
  JsonLdProduct,
  JsonLdOffer,
  ShopifyProduct,
  NextData,
} from './types';

// Utility exports
export {
  getTtlForMerchant,
  identifyMerchant,
  MERCHANT_TTL,
  MERCHANT_DOMAINS,
} from './types';

// Extractor exports
export { extractJsonLd, hasJsonLdData } from './extractors/jsonld';
export { extractShopify, isShopifyStore, discoverShopifyProducts } from './extractors/shopify';
export { extractNextData, hasNextData } from './extractors/next_data';

// Orchestrator exports
export {
  fetchOffer,
  fetchOffersParallel,
  detectAdapterType,
  getSuccessfulOffers,
} from './fetch_offer';

// Refresh service exports
export {
  refreshOffersForProduct,
  getCachedOffers,
  getOffersWithRefresh,
  addProductSource,
} from './refresh';
