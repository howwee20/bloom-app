// Test chart data and price change functions
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function testChart() {
  // Get first asset ID
  const { data: assets } = await supabase
    .from('assets')
    .select('id, name')
    .limit(1);

  if (!assets || assets.length === 0) {
    console.log('No assets found');
    return;
  }

  const assetId = assets[0].id;
  console.log('Testing chart data for:', assets[0].name);
  console.log('Asset ID:', assetId);

  // Test get_price_history_for_chart
  const { data: chartData, error } = await supabase.rpc('get_price_history_for_chart', {
    p_asset_id: assetId,
    p_days: 7
  });

  if (error) {
    console.log('Chart RPC Error:', error.message);
    return;
  }

  console.log('\nChart data points:', chartData?.length);
  chartData?.forEach(p => {
    const date = new Date(p.recorded_at).toLocaleString();
    console.log('  ' + date + ' | $' + p.price);
  });

  // Test get_asset_with_price_change
  console.log('\n--- Testing get_asset_with_price_change() ---');
  const { data: assetData, error: assetError } = await supabase.rpc('get_asset_with_price_change', {
    p_asset_id: assetId
  });

  if (assetError) {
    console.log('Asset RPC Error:', assetError.message);
    return;
  }

  if (assetData && assetData.length > 0) {
    const a = assetData[0];
    console.log('Asset:', a.name);
    console.log('Current price: $' + a.price);
    console.log('24h ago price: $' + a.price_24h_ago);
    console.log('Price change: $' + a.price_change + ' (' + a.price_change_percent + '%)');
  }
}

testChart().catch(console.error);
