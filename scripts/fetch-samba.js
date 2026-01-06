require('dotenv').config({ path: require('path').join(__dirname, '../price-worker/.env') });
const { fetchPrice, searchProduct } = require('../price-worker/lib/stockx');

async function main() {
  const sku = 'ID1481'; // Adidas Samba OG Brown Putty Grey
  const size = '10';

  console.log(`\nFetching price for ${sku} size ${size}...\n`);

  try {
    // Get search results first to find image
    const search = await searchProduct(sku);
    const product = search.products?.[0];

    if (product) {
      console.log('Product Name:', product.title);
      console.log('Image URL:', product.productAttributes?.image_url || product.media?.imageUrl || 'N/A');
      console.log('SKU:', sku);
    }

    // Get price
    const priceData = await fetchPrice(sku, size);

    console.log('\n--- PRICE DATA ---');
    console.log('Lowest Ask:', '$' + priceData.lowestAsk);
    console.log('Highest Bid:', '$' + priceData.highestBid);

    // Calculate P&L at $106 purchase price
    const purchasePrice = 106;
    const currentValue = priceData.lowestAsk;
    const pnlDollars = currentValue - purchasePrice;
    const pnlPercent = ((pnlDollars / purchasePrice) * 100).toFixed(2);

    console.log('\n--- P&L at $106 purchase ---');
    console.log('Purchase Price:', '$' + purchasePrice);
    console.log('Current Value:', '$' + currentValue);
    console.log('P&L:', pnlDollars >= 0 ? '+$' + pnlDollars.toFixed(2) : '-$' + Math.abs(pnlDollars).toFixed(2));
    console.log('P&L %:', pnlDollars >= 0 ? '+' + pnlPercent + '%' : pnlPercent + '%');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
