// lib/search.ts
// LOCAL INDEX SEARCH - Zero network latency
// This is the Google/Backrub approach: search an in-memory index, not the network

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const CATALOG_CACHE_KEY = 'bloom_catalog_index';
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

export interface CatalogProduct {
  id: string;
  name: string;
  brand: string;
  style_code: string;
  image_url: string | null;
  price: number | null;      // Pre-computed best price
  source: string | null;     // Price source
}

// In-memory index - this is what makes search instant
let catalogIndex: CatalogProduct[] = [];
let indexLoaded = false;
let indexLoadPromise: Promise<void> | null = null;

// Brand aliases for better matching
const BRAND_ALIASES: Record<string, string[]> = {
  nike: ['nike', 'jordan', 'air jordan', 'aj'],
  adidas: ['adidas', 'yeezy'],
  newbalance: ['new balance', 'nb'],
};

// Tokenize and normalize text for matching
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0);
}

// Check if product matches query tokens
function matchesQuery(product: CatalogProduct, queryTokens: string[]): boolean {
  const productText = `${product.name} ${product.brand} ${product.style_code}`.toLowerCase();
  const productTokens = tokenize(productText);

  // Every query token must match something in the product
  return queryTokens.every(qt => {
    // Direct match
    if (productTokens.some(pt => pt.includes(qt) || qt.includes(pt))) {
      return true;
    }
    // Brand alias match
    for (const [brand, aliases] of Object.entries(BRAND_ALIASES)) {
      if (aliases.includes(qt) && productText.includes(brand)) {
        return true;
      }
    }
    return false;
  });
}

// Score product for ranking (higher = better match)
function scoreMatch(product: CatalogProduct, queryTokens: string[]): number {
  let score = 0;
  const name = product.name.toLowerCase();
  const brand = product.brand.toLowerCase();

  for (const qt of queryTokens) {
    // Exact brand match = high score
    if (brand === qt) score += 100;
    // Brand contains query
    else if (brand.includes(qt)) score += 50;
    // Name starts with query
    if (name.startsWith(qt)) score += 30;
    // Name contains query
    else if (name.includes(qt)) score += 10;
  }

  // Boost items with prices (they're more useful)
  if (product.price && product.price > 0) score += 20;

  return score;
}

// Load catalog from cache or fetch from DB
async function loadCatalogIndex(): Promise<void> {
  if (indexLoaded) return;

  // Check cache first
  try {
    const cached = await AsyncStorage.getItem(CATALOG_CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < CACHE_TTL_MS) {
        catalogIndex = data;
        indexLoaded = true;
        console.log(`[Search] Loaded ${catalogIndex.length} items from cache`);
        return;
      }
    }
  } catch (e) {
    console.log('[Search] Cache miss or error');
  }

  // Fetch from DB
  console.log('[Search] Fetching catalog from DB...');
  const start = performance.now();

  const { data, error } = await supabase
    .from('catalog_items')
    .select('id, display_name, brand, style_code, image_url_thumb, lowest_price, marketplace')
    .limit(5000);

  if (error) {
    console.error('[Search] Failed to load catalog:', error);
    return;
  }

  catalogIndex = (data || []).map(item => ({
    id: item.id,
    name: item.display_name,
    brand: item.brand || '',
    style_code: item.style_code || '',
    image_url: item.image_url_thumb,
    price: item.lowest_price,
    source: item.marketplace || 'stockx',
  }));

  indexLoaded = true;
  console.log(`[Search] Loaded ${catalogIndex.length} items in ${(performance.now() - start).toFixed(0)}ms`);

  // Cache for next time
  try {
    await AsyncStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({
      data: catalogIndex,
      timestamp: Date.now(),
    }));
  } catch (e) {
    console.log('[Search] Failed to cache catalog');
  }
}

// Initialize the index - call this on app start
export async function initSearchIndex(): Promise<void> {
  if (indexLoadPromise) return indexLoadPromise;
  indexLoadPromise = loadCatalogIndex();
  return indexLoadPromise;
}

// Check if index is ready
export function isIndexReady(): boolean {
  return indexLoaded && catalogIndex.length > 0;
}

// THE MAIN SEARCH FUNCTION - Pure in-memory, ZERO network
export function searchCatalog(query: string, limit: number = 20): CatalogProduct[] {
  const start = performance.now();

  if (!query.trim()) return [];
  if (!indexLoaded) {
    console.log('[Search] Index not loaded yet');
    return [];
  }

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  // Filter and score matches
  const matches = catalogIndex
    .filter(p => matchesQuery(p, queryTokens))
    .map(p => ({ product: p, score: scoreMatch(p, queryTokens) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(m => m.product);

  const elapsed = performance.now() - start;
  console.log(`[Search] "${query}" → ${matches.length} results in ${elapsed.toFixed(1)}ms`);

  return matches;
}

// Force refresh the index
export async function refreshCatalogIndex(): Promise<void> {
  indexLoaded = false;
  indexLoadPromise = null;
  await AsyncStorage.removeItem(CATALOG_CACHE_KEY);
  await initSearchIndex();
}
