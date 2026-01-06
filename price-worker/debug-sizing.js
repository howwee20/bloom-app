/**
 * Debug script to check if RapidAPI returns size-specific pricing
 * Run: node debug-sizing.js
 */

const fetch = require('node-fetch');

const RAPIDAPI_KEY = '0840563baemsh52aef100825d2d4p156784jsn88f14e5aec4a';
const RAPIDAPI_HOST = 'sneaker-database-stockx.p.rapidapi.com';

async function debugSizing() {
  const sku = 'FV5029-010'; // Black Cat 2025

  console.log('='.repeat(70));
  console.log('DEBUG: Checking RapidAPI Size-Specific Pricing');
  console.log('='.repeat(70));
  console.log('SKU:', sku);
  console.log('');

  const url = `https://${RAPIDAPI_HOST}/getproducts?keywords=${sku}&limit=1`;

  console.log('Request URL:', url);
  console.log('');

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': RAPIDAPI_KEY,
        'X-RapidAPI-Host': RAPIDAPI_HOST
      }
    });

    console.log('Response Status:', response.status);
    console.log('');

    const data = await response.json();

    console.log('='.repeat(70));
    console.log('RAW JSON RESPONSE (FULL):');
    console.log('='.repeat(70));
    console.log(JSON.stringify(data, null, 2));
    console.log('');

    // Quick analysis
    if (Array.isArray(data) && data.length > 0) {
      const product = data[0];

      console.log('='.repeat(70));
      console.log('QUICK ANALYSIS:');
      console.log('='.repeat(70));
      console.log('Product Name:', product.shoeName || product.make || 'N/A');
      console.log('Style ID:', product.styleID || 'N/A');
      console.log('Retail Price:', product.retailPrice || 'N/A');
      console.log('');

      console.log('lowestResellPrice object:');
      console.log(JSON.stringify(product.lowestResellPrice, null, 2));
      console.log('');

      console.log('Has resellPrices?', !!product.resellPrices);
      if (product.resellPrices) {
        console.log('resellPrices:', JSON.stringify(product.resellPrices, null, 2));
      }

      console.log('Has variants?', !!product.variants);
      if (product.variants) {
        console.log('variants:', JSON.stringify(product.variants, null, 2));
      }

      console.log('Has sizes?', !!product.sizes);
      if (product.sizes) {
        console.log('sizes:', JSON.stringify(product.sizes, null, 2));
      }

      console.log('Has priceMap?', !!product.priceMap);
      if (product.priceMap) {
        console.log('priceMap:', JSON.stringify(product.priceMap, null, 2));
      }

      // Check all keys for anything size-related
      console.log('');
      console.log('All top-level keys:', Object.keys(product));
    }

  } catch (err) {
    console.error('Error:', err.message);
  }
}

debugSizing();
