// Debug token listing status
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function debugTokens() {
  console.log('=== DEBUG TOKEN LISTINGS ===\n');

  // Get all tokens (this will be RLS-filtered to current user)
  const { data: tokens, error } = await supabase
    .from('tokens')
    .select('id, product_name, status, is_listed_for_sale, listing_price, is_exchange_eligible')
    .order('created_at', { ascending: false });

  if (error) {
    console.log('Error fetching tokens:', error.message);
    return;
  }

  if (!tokens?.length) {
    console.log('No tokens found (might be RLS restriction)');
    return;
  }

  console.log(`Found ${tokens.length} tokens:\n`);

  tokens.forEach(t => {
    console.log(`Token: ${t.product_name.slice(0, 30)}...`);
    console.log(`  ID: ${t.id}`);
    console.log(`  Status: ${t.status}`);
    console.log(`  is_listed_for_sale: ${t.is_listed_for_sale}`);
    console.log(`  listing_price: ${t.listing_price}`);
    console.log(`  is_exchange_eligible: ${t.is_exchange_eligible}`);

    // Check for mismatches
    if (t.status === 'listed' && !t.is_listed_for_sale) {
      console.log('  ⚠️  MISMATCH: status=listed but is_listed_for_sale=false');
    }
    if (t.is_listed_for_sale && t.status !== 'listed') {
      console.log('  ⚠️  MISMATCH: is_listed_for_sale=true but status is not listed');
    }
    console.log('');
  });

  // Test unlist_token function directly
  const listedTokens = tokens.filter(t => t.is_listed_for_sale);
  if (listedTokens.length > 0) {
    console.log('\n=== TESTING UNLIST FUNCTION ===');
    console.log(`Testing with token: ${listedTokens[0].id}`);

    const { data, error: rpcError } = await supabase.rpc('unlist_token', {
      p_token_id: listedTokens[0].id
    });

    console.log('RPC Response:');
    console.log('  data:', JSON.stringify(data, null, 2));
    console.log('  error:', rpcError ? rpcError.message : 'none');
  }
}

debugTokens().catch(console.error);
