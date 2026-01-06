const fetch = require('node-fetch');

// StockX Official API V2
const STOCKX_API_KEY = process.env.STOCKX_API_KEY;
const STOCKX_CLIENT_ID = process.env.STOCKX_CLIENT_ID;
const STOCKX_CLIENT_SECRET = process.env.STOCKX_CLIENT_SECRET;
const STOCKX_REFRESH_TOKEN = process.env.STOCKX_REFRESH_TOKEN;

const TOKEN_URL = 'https://accounts.stockx.com/oauth/token';
const API_BASE = 'https://api.stockx.com';

let cachedAccessToken = null;
let tokenExpiry = 0;

/**
 * Get access token using refresh token (auto-refreshes)
 */
async function getAccessToken() {
  if (cachedAccessToken && Date.now() < tokenExpiry - 300000) {
    return cachedAccessToken;
  }

  console.log('[STOCKX] Refreshing access token...');

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: STOCKX_CLIENT_ID,
      client_secret: STOCKX_CLIENT_SECRET,
      refresh_token: STOCKX_REFRESH_TOKEN,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token refresh failed: ${response.status} - ${error}`);
  }

  const data = await response.json();
  cachedAccessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000);

  console.log('[STOCKX] Token refreshed, valid for', Math.round(data.expires_in / 3600), 'hours');
  return cachedAccessToken;
}

/**
 * Make authenticated API request
 */
async function apiRequest(endpoint) {
  const token = await getAccessToken();

  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-api-key': STOCKX_API_KEY,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error ${response.status}: ${error}`);
  }

  return response.json();
}

/**
 * Search for a product by SKU
 */
async function searchProduct(sku) {
  return apiRequest(`/v2/catalog/search?query=${encodeURIComponent(sku)}`);
}

/**
 * Get product variants (sizes)
 */
async function getProductVariants(productId) {
  return apiRequest(`/v2/catalog/products/${productId}/variants`);
}

/**
 * Get market data for all variants of a product
 */
async function getProductMarketData(productId) {
  return apiRequest(`/v2/catalog/products/${productId}/market-data`);
}

/**
 * Fetch price for a SKU and size
 * Returns { lowestAsk, highestBid, productName }
 */
async function fetchPrice(sku, size = '10') {
  // Step 1: Search for product
  const searchResults = await searchProduct(sku);

  if (!searchResults.products || searchResults.products.length === 0) {
    throw new Error(`No product found for SKU: ${sku}`);
  }

  const product = searchResults.products[0];
  const productId = product.productId;
  const productName = product.title || sku;

  console.log(`[STOCKX] Found: ${productName}`);

  // Step 2: Get variants to find the target size
  const variants = await getProductVariants(productId);

  let targetVariantId = null;
  for (const variant of variants) {
    // variantValue is the size string (e.g., "10", "10.5")
    if (variant.variantValue === size || variant.variantValue === String(size)) {
      targetVariantId = variant.variantId;
      break;
    }
  }

  if (!targetVariantId) {
    console.log(`[STOCKX] Size ${size} not found, available sizes:`, variants.slice(0, 5).map(v => v.variantValue).join(', '));
    // Use first available variant as fallback
    targetVariantId = variants[0]?.variantId;
  }

  // Step 3: Get market data for all variants
  const marketData = await getProductMarketData(productId);

  // Find the market data for our target variant
  const variantMarket = marketData.find(m => m.variantId === targetVariantId);

  if (!variantMarket) {
    throw new Error(`No market data for ${productName} size ${size}`);
  }

  // Extract prices - lowestAskAmount can be null if no asks
  let lowestAsk = variantMarket.lowestAskAmount ? Number(variantMarket.lowestAskAmount) : null;
  let highestBid = variantMarket.highestBidAmount ? Number(variantMarket.highestBidAmount) : null;

  // If no ask, use earnMore (what sellers should ask for)
  if (!lowestAsk && variantMarket.earnMoreAmount) {
    lowestAsk = Number(variantMarket.earnMoreAmount);
    console.log(`[STOCKX] No active asks, using earnMore: $${lowestAsk}`);
  }

  // If still no price, use sellFaster as estimate
  if (!lowestAsk && variantMarket.sellFasterAmount) {
    lowestAsk = Number(variantMarket.sellFasterAmount);
    console.log(`[STOCKX] Using sellFaster estimate: $${lowestAsk}`);
  }

  if (!lowestAsk) {
    throw new Error(`No price data for ${productName} size ${size}`);
  }

  // Estimate bid if not available
  if (!highestBid) {
    highestBid = Math.round(lowestAsk * 0.88 * 100) / 100;
  }

  console.log(`[STOCKX] ${productName} Size ${size}: Ask $${lowestAsk} | Bid $${highestBid}`);

  return {
    lowestAsk,
    highestBid,
    productName,
    sku,
    size,
  };
}

module.exports = {
  fetchPrice,
  searchProduct,
  getProductVariants,
  getProductMarketData,
  getAccessToken
};
