// Seed price history with ALIVE Protocol simulation
// This creates baseline price data for all assets

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Michigan all-in pricing formula
const ALL_IN_MULTIPLIER = 1.063 * 1.048; // MI tax × processing = ~1.1135
const FLAT_SHIPPING = 14.95;

function calculateAllInPrice(lowestAsk) {
  return Math.round((lowestAsk * ALL_IN_MULTIPLIER + FLAT_SHIPPING) * 100) / 100;
}

// ALIVE Protocol: Synthetic fluctuation +/- 1.5%
function applySyntheticFluctuation(currentPrice) {
  const fluctuation = (Math.random() * 0.03) - 0.015; // -1.5% to +1.5%
  return Math.round(currentPrice * (1 + fluctuation) * 100) / 100;
}

async function main() {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    console.log('SUPABASE_SERVICE_ROLE_KEY not found in .env');
    console.log('Please add it to your .env file to run this script');
    console.log('You can find it in Supabase Dashboard > Settings > API');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Get all assets
  const { data: assets, error: assetsError } = await supabase
    .from('assets')
    .select('id, name, price');

  if (assetsError) {
    console.error('Error fetching assets:', assetsError);
    return;
  }

  console.log(`Found ${assets.length} assets`);
  console.log('Seeding price history...\n');

  for (const asset of assets) {
    console.log(`Processing: ${asset.name}`);

    // Create 7 days of price history (one entry per day)
    const basePrice = asset.price;

    for (let daysAgo = 7; daysAgo >= 0; daysAgo--) {
      // Fluctuate price randomly to simulate market movement
      const priceForDay = applySyntheticFluctuation(basePrice);
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);
      date.setHours(12, 0, 0, 0); // Noon each day

      const { error } = await supabase
        .from('price_history')
        .insert({
          asset_id: asset.id,
          price: priceForDay,
          source: daysAgo === 0 ? 'baseline' : 'alive_protocol',
          created_at: date.toISOString()
        });

      if (error) {
        console.log(`  Error for day -${daysAgo}:`, error.message);
      } else {
        const sign = priceForDay >= basePrice ? '+' : '';
        const diff = priceForDay - basePrice;
        console.log(`  Day -${daysAgo}: $${priceForDay} (${sign}${diff.toFixed(2)})`);
      }
    }

    // Update asset's last_price_update
    await supabase
      .from('assets')
      .update({ last_price_update: new Date().toISOString() })
      .eq('id', asset.id);

    console.log('');
  }

  console.log('Done! Price history seeded.');

  // Verify
  const { data: historyCount } = await supabase
    .from('price_history')
    .select('id', { count: 'exact' });

  console.log(`\nTotal price history entries: ${historyCount?.length || 0}`);
}

main().catch(console.error);
