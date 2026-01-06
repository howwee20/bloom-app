// Verify test item is ready for purchase
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function verifyTestItem() {
  console.log('=== VERIFYING TEST ITEM ===\n');

  const { data: asset, error } = await supabase
    .from('assets')
    .select('id, name, price, status, custody_status, last_price_update')
    .eq('name', 'Test Token - $0.50')
    .single();

  if (error) {
    console.log('❌ Test item not found:', error.message);
    return;
  }

  console.log('Test Item Found:');
  console.log(`  ID: ${asset.id}`);
  console.log(`  Name: ${asset.name}`);
  console.log(`  Price: $${asset.price}`);
  console.log(`  Status: ${asset.status}`);
  console.log(`  Custody: ${asset.custody_status}`);
  console.log(`  Last Price Update: ${asset.last_price_update}`);

  // Check staleness (4 hour threshold)
  if (asset.last_price_update) {
    const lastUpdate = new Date(asset.last_price_update);
    const minutesSinceUpdate = (Date.now() - lastUpdate.getTime()) / 60000;
    const STALE_MINUTES = 240; // 4 hours

    if (minutesSinceUpdate > STALE_MINUTES) {
      console.log(`\n❌ Price is STALE (${Math.round(minutesSinceUpdate)} minutes old)`);
      console.log('   The "Buy" button will be disabled.');
      console.log('   Fix: Run the migration to update last_price_update');
    } else {
      console.log(`\n✅ Price is FRESH (${Math.round(minutesSinceUpdate)} minutes old)`);
      console.log('   The "Buy" button should be enabled!');
    }
  } else {
    console.log('\n❌ No last_price_update timestamp!');
    console.log('   The "Buy" button will be disabled.');
  }

  console.log('\n=== READY FOR TESTING ===');
  console.log('1. Open the app');
  console.log('2. Go to Explore tab');
  console.log('3. Find "Test Token - $0.50"');
  console.log('4. Tap to view details');
  console.log('5. Tap "Buy Ownership" button');
  console.log('6. Complete payment with test card: 4242 4242 4242 4242');
  console.log('7. Token should appear in Portfolio!');
}

verifyTestItem().catch(console.error);
