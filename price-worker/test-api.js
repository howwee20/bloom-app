const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { fetchPrice } = require('./lib/stockx.js');

(async () => {
  console.log('Testing StockX authenticated API...');
  console.log('API Key:', process.env.STOCKX_API_KEY ? 'SET' : 'MISSING');
  console.log('Client ID:', process.env.STOCKX_CLIENT_ID ? 'SET' : 'MISSING');

  try {
    // Test with Jordan 4 Retro Bred Reimagined SKU
    const result = await fetchPrice('FV5029-006', '10');
    console.log('\nResult:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
