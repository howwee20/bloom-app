const fetch = require('node-fetch');

// StockX Official API V2 Configuration
const STOCKX_API_KEY = process.env.STOCKX_API_KEY;
const STOCKX_CLIENT_ID = process.env.STOCKX_CLIENT_ID;
const STOCKX_CLIENT_SECRET = process.env.STOCKX_CLIENT_SECRET;

// Fallback env var (only used if DB has no token yet)
const STOCKX_REFRESH_TOKEN_ENV = process.env.STOCKX_REFRESH_TOKEN;

const TOKEN_URL = 'https://accounts.stockx.com/oauth/token';
const API_BASE = 'https://api.stockx.com';

// In-memory cache (per process lifetime)
let cachedAccessToken = null;
let tokenExpiry = 0;

// Module-level supabase client (set via init)
let supabaseClient = null;

/**
 * Initialize the StockX module with a Supabase client
 * Must be called before using any API functions
 */
function init(supabase) {
  supabaseClient = supabase;
  console.log('[STOCKX] Initialized with Supabase client');
}

/**
 * Get current refresh token from Supabase (or fall back to env var)
 */
async function getRefreshToken() {
  if (!supabaseClient) {
    console.log('[STOCKX] No Supabase client, using env var fallback');
    return STOCKX_REFRESH_TOKEN_ENV;
  }

  try {
    const { data, error } = await supabaseClient.rpc('get_stockx_tokens');

    if (error) {
      console.error('[STOCKX] Failed to fetch tokens from DB:', error.message);
      return STOCKX_REFRESH_TOKEN_ENV;
    }

    const tokens = data?.[0];

    if (tokens?.refresh_token) {
      const age = tokens.refresh_token_updated_at
        ? Math.round((Date.now() - new Date(tokens.refresh_token_updated_at).getTime()) / 1000 / 60)
        : 'unknown';
      console.log(`[STOCKX] Using refresh token from DB (age: ${age} minutes)`);
      return tokens.refresh_token;
    }

    console.log('[STOCKX] No refresh token in DB, using env var fallback');
    return STOCKX_REFRESH_TOKEN_ENV;

  } catch (err) {
    console.error('[STOCKX] Error fetching tokens:', err.message);
    return STOCKX_REFRESH_TOKEN_ENV;
  }
}

/**
 * Save new tokens to Supabase after successful refresh
 */
async function saveTokens(accessToken, expiresAt, refreshToken) {
  if (!supabaseClient) {
    console.warn('[STOCKX] No Supabase client, cannot persist new refresh token!');
    console.warn('[STOCKX] The new refresh token will be lost on next run.');
    return;
  }

  try {
    const { error } = await supabaseClient.rpc('update_stockx_tokens', {
      p_access_token: accessToken,
      p_access_token_expires_at: expiresAt.toISOString(),
      p_refresh_token: refreshToken
    });

    if (error) {
      console.error('[STOCKX] Failed to save tokens to DB:', error.message);
      console.error('[STOCKX] CRITICAL: New refresh token was not persisted!');
    } else {
      console.log('[STOCKX] New tokens saved to DB successfully');
    }
  } catch (err) {
    console.error('[STOCKX] Error saving tokens:', err.message);
  }
}

/**
 * Get access token using refresh token (auto-refreshes)
 * Now properly saves the new refresh token to the database
 *
 * OAuth 2.0 Spec-Correct Implementation:
 * - Content-Type: application/x-www-form-urlencoded
 * - grant_type=refresh_token
 * - client_id + client_secret in body (not Basic auth header)
 */
async function getAccessToken() {
  // Return cached token if still valid (5 min buffer)
  if (cachedAccessToken && Date.now() < tokenExpiry - 300000) {
    const remainingMinutes = Math.round((tokenExpiry - Date.now()) / 1000 / 60);
    console.log(`[STOCKX] Using cached token (expires in ${remainingMinutes}m)`);
    return cachedAccessToken;
  }

  console.log('[STOCKX] ─────────────────────────────────────');
  console.log('[STOCKX] Starting token refresh...');

  // Get current refresh token (DB or env fallback)
  const refreshToken = await getRefreshToken();

  if (!refreshToken) {
    console.error('[STOCKX] ✗ No refresh token available');
    throw new Error('No refresh token available (check DB and STOCKX_REFRESH_TOKEN env var)');
  }

  // Log request details (no secrets)
  console.log(`[STOCKX] Token URL: ${TOKEN_URL}`);
  console.log(`[STOCKX] Grant type: refresh_token`);
  console.log(`[STOCKX] Client ID: ${STOCKX_CLIENT_ID ? STOCKX_CLIENT_ID.slice(0, 8) + '...' : '(missing)'}`);
  console.log(`[STOCKX] Refresh token: ${refreshToken.slice(0, 8)}...${refreshToken.slice(-8)}`);

  // Build request body (OAuth 2.0 spec-correct)
  const requestBody = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: STOCKX_CLIENT_ID,
    client_secret: STOCKX_CLIENT_SECRET,
    refresh_token: refreshToken,
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: requestBody
  });

  console.log(`[STOCKX] Response status: ${response.status}`);

  if (!response.ok) {
    const errorText = await response.text();
    let errorBody;
    try {
      errorBody = JSON.parse(errorText);
    } catch {
      errorBody = { raw: errorText.slice(0, 200) };
    }

    console.error('[STOCKX] ✗ Token refresh FAILED');
    console.error(`[STOCKX] Error: ${errorBody.error || 'Unknown'}`);
    console.error(`[STOCKX] Description: ${errorBody.error_description || errorText.slice(0, 100)}`);
    console.log('[STOCKX] ─────────────────────────────────────');

    throw new Error(`Token refresh failed: ${response.status} - ${errorBody.error || errorText.slice(0, 100)}`);
  }

  const data = await response.json();

  // Cache the new access token
  cachedAccessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000);
  const expiresAt = new Date(tokenExpiry);

  console.log('[STOCKX] ✓ Token refresh SUCCESSFUL');
  console.log(`[STOCKX] Access token: ${data.access_token ? 'received' : 'MISSING'}`);
  console.log(`[STOCKX] Refresh token: ${data.refresh_token ? 'received (rotated)' : 'NOT rotated'}`);
  console.log(`[STOCKX] Expires at: ${expiresAt.toISOString()}`);
  console.log(`[STOCKX] Expires in: ${Math.round(data.expires_in / 60)} minutes`);

  // CRITICAL: Save the new refresh token to database
  if (data.refresh_token) {
    console.log('[STOCKX] Saving rotated tokens to database...');
    await saveTokens(data.access_token, expiresAt, data.refresh_token);
  } else {
    console.warn('[STOCKX] ⚠ No new refresh token in response (token may not have rotated)');
  }

  console.log('[STOCKX] ─────────────────────────────────────');

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

/**
 * Get token health status (for monitoring)
 */
async function getTokenHealth() {
  if (!supabaseClient) {
    return {
      source: 'env',
      hasRefreshToken: !!STOCKX_REFRESH_TOKEN_ENV,
      cachedAccessTokenValid: cachedAccessToken && Date.now() < tokenExpiry,
      accessTokenExpiresIn: cachedAccessToken ? Math.round((tokenExpiry - Date.now()) / 1000 / 60) : null
    };
  }

  try {
    const { data, error } = await supabaseClient.rpc('get_stockx_tokens');

    if (error) {
      return { source: 'error', error: error.message };
    }

    const tokens = data?.[0];

    return {
      source: 'database',
      hasRefreshToken: !!tokens?.refresh_token,
      refreshTokenAge: tokens?.refresh_token_updated_at
        ? Math.round((Date.now() - new Date(tokens.refresh_token_updated_at).getTime()) / 1000 / 60)
        : null,
      accessTokenExpiresAt: tokens?.access_token_expires_at,
      cachedAccessTokenValid: cachedAccessToken && Date.now() < tokenExpiry,
      cachedAccessTokenExpiresIn: cachedAccessToken ? Math.round((tokenExpiry - Date.now()) / 1000 / 60) : null
    };
  } catch (err) {
    return { source: 'error', error: err.message };
  }
}

module.exports = {
  init,
  fetchPrice,
  searchProduct,
  getProductVariants,
  getProductMarketData,
  getAccessToken,
  getTokenHealth
};
