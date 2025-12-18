const fetch = require('node-fetch');

// Retailed API - Sneaker Lowest Ask endpoint
// Docs: https://www.retailed.io/datasources/api/sneaker-lowest-ask
const RETAILED_API_URL = 'https://app.retailed.io/api/v1/db/products/asks';

/**
 * Fetch the lowest ask for a specific SKU and size from Retailed API
 * @param {string} sku - The StockX SKU (e.g., 'FQ8232-100')
 * @param {string} size - The shoe size (e.g., '10')
 * @returns {Promise<{lowestAsk: number, productName: string}>}
 */
async function fetchLowestAsk(sku, size = '10') {
  const apiKey = process.env.RETAILED_API_KEY;

  if (!apiKey) {
    throw new Error('RETAILED_API_KEY not configured');
  }

  const url = `${RETAILED_API_URL}?query=${encodeURIComponent(sku)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Retailed API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();

  // Handle different response formats
  // The API may return an array of products or a single product
  let product = null;

  if (Array.isArray(data)) {
    // Find exact SKU match
    product = data.find(p => p.sku === sku || p.styleId === sku);
    if (!product && data.length > 0) {
      product = data[0]; // Fall back to first result
    }
  } else if (data.products && Array.isArray(data.products)) {
    product = data.products.find(p => p.sku === sku || p.styleId === sku);
    if (!product && data.products.length > 0) {
      product = data.products[0];
    }
  } else if (data.sku || data.styleId) {
    product = data;
  }

  if (!product) {
    throw new Error(`No product found for SKU: ${sku}`);
  }

  // Extract lowest ask for the specific size
  // The API may have different structures for pricing
  let lowestAsk = null;
  const productName = product.name || product.title || product.shoeName || sku;

  // Try different price structures
  if (product.variants && Array.isArray(product.variants)) {
    // Format: variants array with size and price
    const variant = product.variants.find(v =>
      v.size === size ||
      v.size === `${size}` ||
      v.size === `US ${size}` ||
      String(v.size) === String(size)
    );
    if (variant) {
      lowestAsk = variant.lowestAsk || variant.price || variant.lastSale;
    }
  }

  if (!lowestAsk && product.market && product.market.lowestAsk) {
    // Format: market object with overall lowestAsk
    lowestAsk = product.market.lowestAsk;
  }

  if (!lowestAsk && product.resellPrices?.stockX) {
    // Format: resellPrices.stockX object keyed by size
    const sizeFormats = [size, `${size}`, `US ${size}`, `${size} US`];
    for (const fmt of sizeFormats) {
      if (product.resellPrices.stockX[fmt]) {
        lowestAsk = product.resellPrices.stockX[fmt];
        break;
      }
    }
  }

  if (!lowestAsk && product.lowestAsk) {
    // Format: direct lowestAsk property
    lowestAsk = product.lowestAsk;
  }

  if (!lowestAsk && product.prices) {
    // Format: prices object
    const sizeKey = Object.keys(product.prices).find(k =>
      k === size || k === `US ${size}` || k.includes(size)
    );
    if (sizeKey) {
      lowestAsk = product.prices[sizeKey]?.lowestAsk || product.prices[sizeKey];
    }
  }

  if (!lowestAsk) {
    throw new Error(`Size ${size} not found for ${sku}. Product: ${productName}`);
  }

  return {
    lowestAsk: Number(lowestAsk),
    productName,
    sku: product.sku || product.styleId || sku,
    size
  };
}

module.exports = { fetchLowestAsk };
