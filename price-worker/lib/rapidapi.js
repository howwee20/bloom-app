const fetch = require('node-fetch');

// RapidAPI Sneaker Database - StockX
// https://rapidapi.com/belchiorarkad-FqvHs2EDOtP/api/sneaker-database-stockx
const RAPIDAPI_HOST = 'sneaker-database-stockx.p.rapidapi.com';
const RAPIDAPI_URL = `https://${RAPIDAPI_HOST}/getproducts`;

/**
 * Fetch the lowest StockX price for a SKU from RapidAPI Sneaker Database
 *
 * @param {string} sku - The StockX SKU (e.g., 'FQ8232-010')
 * @param {string} size - The shoe size (not used - API returns overall lowest)
 * @returns {Promise<{lowestAsk: number, productName: string}>}
 */
async function fetchPrice(sku, size = '10') {
  const apiKey = process.env.RAPIDAPI_KEY;

  if (!apiKey) {
    throw new Error('RAPIDAPI_KEY not configured');
  }

  const url = `${RAPIDAPI_URL}?keywords=${encodeURIComponent(sku)}&limit=1`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'X-RapidAPI-Key': apiKey,
      'X-RapidAPI-Host': RAPIDAPI_HOST
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`RapidAPI error ${response.status}: ${errorText}`);
  }

  const data = await response.json();

  // API returns an array of products
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`No results for SKU: ${sku}`);
  }

  const product = data[0];

  // Extract product name
  const productName = product.shoeName || product.make || sku;

  // Extract lowestResellPrice.stockX (primary price source)
  let lowestAsk = null;

  if (product.lowestResellPrice?.stockX) {
    lowestAsk = product.lowestResellPrice.stockX;
  } else if (product.lowestResellPrice?.goat) {
    // Fallback to GOAT price
    lowestAsk = product.lowestResellPrice.goat;
  } else if (product.lowestResellPrice?.flightClub) {
    // Fallback to Flight Club
    lowestAsk = product.lowestResellPrice.flightClub;
  } else if (product.retailPrice) {
    // Last resort: retail price
    lowestAsk = product.retailPrice;
  }

  if (!lowestAsk) {
    console.log(`[RAPIDAPI] Product structure:`, JSON.stringify(product, null, 2).substring(0, 500));
    throw new Error(`No price found for "${productName}" (SKU: ${sku})`);
  }

  console.log(`[RAPIDAPI] Found: "${productName}" (${product.styleID}) -> StockX $${lowestAsk}`);

  return {
    lowestAsk: Number(lowestAsk),
    productName,
    sku: product.styleID || sku,
    size
  };
}

module.exports = { fetchPrice };
