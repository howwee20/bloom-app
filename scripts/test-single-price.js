// Test single asset price update
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
  // Get first asset
  const { data: assets } = await supabase
    .from('assets')
    .select('id, name')
    .limit(1);

  if (!assets || assets.length === 0) {
    console.log('No assets found');
    return;
  }

  const asset = assets[0];
  console.log('Testing single asset update for:', asset.name);
  console.log('Asset ID:', asset.id);

  // Call single update
  const response = await fetch(
    process.env.EXPO_PUBLIC_SUPABASE_URL + '/functions/v1/update-prices/single',
    {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ asset_id: asset.id }),
    }
  );

  const text = await response.text();
  console.log('Response status:', response.status);
  console.log('Response:', text);

  // Check if price history was created
  const { data: history } = await supabase
    .from('price_history')
    .select('*')
    .eq('asset_id', asset.id)
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('\nPrice history for this asset:', history?.length || 0, 'entries');
  if (history) {
    history.forEach(h => {
      console.log(`  ${h.source}: $${h.price} at ${h.created_at}`);
    });
  }
}

main().catch(console.error);
