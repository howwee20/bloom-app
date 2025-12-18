const fetch = require('node-fetch');

// Retailed API - Sneaker Lowest Ask endpoint
// Docs: https://www.retailed.io/datasources/api/sneaker-lowest-ask
const RETAILED_API_URL = 'https://app.retailed.io/api/v1/db/products/asks';

/**
 * Fetch the lowest ask for a specific SKU from Retailed API
 * Uses FUZZY matching - trusts first result from API search
 *
 * @param {string} sku - The StockX SKU (e.g., 'FQ8232-010')
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

  // FUZZY MATCH: Trust the first result from the API
  // If we searched for a unique SKU, the first result should be correct
  let product = null;

  if (data.docs && Array.isArray(data.docs) && data.docs.length > 0) {
    product = data.docs[0];
  } else if (Array.isArray(data) && data.length > 0) {
    product = data[0];
  } else if (data.products && Array.isArray(data.products) && data.products.length > 0) {
    product = data.products[0];
  } else if (data.id || data.sku || data.lowestAsk || data.price) {
    // Single product response
    product = data;
  }

  if (!product) {
    throw new Error(`No results returned for SKU: ${sku}`);
  }

  // Extract product name (try multiple fields)
  const productName = product.title
    || product.name
    || product.shoeName
    || product.productName
    || product.urlSlug
    || sku;

  // Log what we found for verification
  console.log(`[RETAILED] Found: "${productName}" for SKU ${sku}`);

  // PRICE EXTRACTION: Try multiple strategies
  let lowestAsk = null;

  // Strategy 1: Direct lowestAsk field
  if (product.lowestAsk && typeof product.lowestAsk === 'number') {
    lowestAsk = product.lowestAsk;
  }

  // Strategy 2: Price field
  if (!lowestAsk && product.price && typeof product.price === 'number') {
    lowestAsk = product.price;
  }

  // Strategy 3: Market object
  if (!lowestAsk && product.market?.lowestAsk) {
    lowestAsk = product.market.lowestAsk;
  }

  // Strategy 4: Variants array - find matching size
  if (!lowestAsk && product.variants && Array.isArray(product.variants)) {
    // First try to find exact size match
    const sizeVariant = product.variants.find(v => {
      const variantSize = String(v.size || '').replace(/[^0-9.]/g, '');
      const targetSize = String(size).replace(/[^0-9.]/g, '');
      return variantSize === targetSize;
    });

    if (sizeVariant) {
      lowestAsk = sizeVariant.lowestAsk || sizeVariant.price || sizeVariant.lastSale;
      console.log(`[RETAILED] Using size ${size} variant price: $${lowestAsk}`);
    } else if (product.variants.length > 0) {
      // Fallback: use first variant with a price
      const anyVariant = product.variants.find(v => v.lowestAsk || v.price);
      if (anyVariant) {
        lowestAsk = anyVariant.lowestAsk || anyVariant.price;
        console.log(`[RETAILED] Size ${size} not found, using variant size ${anyVariant.size}: $${lowestAsk}`);
      }
    }
  }

  // Strategy 5: Prices object keyed by size
  if (!lowestAsk && product.prices && typeof product.prices === 'object') {
    // Try exact size match first
    const sizeKeys = Object.keys(product.prices);
    const matchingKey = sizeKeys.find(k => {
      const keySize = String(k).replace(/[^0-9.]/g, '');
      const targetSize = String(size).replace(/[^0-9.]/g, '');
      return keySize === targetSize;
    });

    if (matchingKey) {
      const priceData = product.prices[matchingKey];
      lowestAsk = typeof priceData === 'number' ? priceData : priceData?.lowestAsk || priceData?.price;
    } else if (sizeKeys.length > 0) {
      // Fallback to first available price
      const firstKey = sizeKeys[0];
      const priceData = product.prices[firstKey];
      lowestAsk = typeof priceData === 'number' ? priceData : priceData?.lowestAsk || priceData?.price;
    }
  }

  // Strategy 6: resellPrices.stockX (legacy format)
  if (!lowestAsk && product.resellPrices?.stockX) {
    const stockxPrices = product.resellPrices.stockX;
    const sizeKeys = Object.keys(stockxPrices);
    const matchingKey = sizeKeys.find(k => String(k).includes(size));

    if (matchingKey) {
      lowestAsk = stockxPrices[matchingKey];
    } else if (sizeKeys.length > 0) {
      lowestAsk = stockxPrices[sizeKeys[0]];
    }
  }

  // Strategy 7: salePrice or lastSale as fallback
  if (!lowestAsk) {
    lowestAsk = product.salePrice || product.lastSale || product.retailPrice;
  }

  if (!lowestAsk) {
    // Log the product structure to help debug
    console.log(`[RETAILED] Product structure:`, JSON.stringify(product, null, 2).substring(0, 500));
    throw new Error(`No price found for "${productName}" (SKU: ${sku})`);
  }

  return {
    lowestAsk: Number(lowestAsk),
    productName,
    sku: product.sku || product.styleId || sku,
    size
  };
}

module.exports = { fetchLowestAsk };
