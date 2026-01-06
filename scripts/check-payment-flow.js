// Check payment flow - verify orders and tokens after Stripe payment
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// We need to check environment for service role key
const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function checkPaymentFlow() {
  console.log('=== CHECKING PAYMENT FLOW ===');
  console.log(`Using: anon key (RLS applies)\n`);

  // First, let's just check if tables exist and are accessible
  console.log('1. Checking table access...');

  // Check orders count (should work even with RLS)
  const { count: orderCount, error: orderCountError } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true });

  if (orderCountError) {
    console.log(`   Orders table: ERROR - ${orderCountError.message}`);
  } else {
    console.log(`   Orders table: accessible (${orderCount || 0} visible rows)`);
  }

  // Check tokens count
  const { count: tokenCount, error: tokenCountError } = await supabase
    .from('tokens')
    .select('*', { count: 'exact', head: true });

  if (tokenCountError) {
    console.log(`   Tokens table: ERROR - ${tokenCountError.message}`);
  } else {
    console.log(`   Tokens table: accessible (${tokenCount || 0} visible rows)`);
  }

  // Check assets count
  const { count: assetCount, error: assetCountError } = await supabase
    .from('assets')
    .select('*', { count: 'exact', head: true });

  if (assetCountError) {
    console.log(`   Assets table: ERROR - ${assetCountError.message}`);
  } else {
    console.log(`   Assets table: accessible (${assetCount || 0} rows)`);
  }

  console.log('\n2. Note: Orders/Tokens are likely showing 0 due to RLS (row level security).');
  console.log('   With anon key, you can only see YOUR OWN orders/tokens.');
  console.log('   The Stripe webhook uses service_role key which bypasses RLS.');

  console.log('\n=== STRIPE WEBHOOK SETUP REQUIRED ===');
  console.log('');
  console.log('The webhook must be configured in Stripe Dashboard:');
  console.log('');
  console.log('1. Go to: https://dashboard.stripe.com/test/webhooks');
  console.log('   (Use /test/ for test mode!)');
  console.log('');
  console.log('2. Click "Add endpoint"');
  console.log('');
  console.log('3. Endpoint URL:');
  console.log(`   ${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/stripe-webhook`);
  console.log('');
  console.log('4. Select events to listen to:');
  console.log('   - checkout.session.completed');
  console.log('   - checkout.session.expired (optional)');
  console.log('');
  console.log('5. Click "Add endpoint"');
  console.log('');
  console.log('6. Copy the "Signing secret" (starts with whsec_)');
  console.log('');
  console.log('7. Update Supabase secret:');
  console.log('   npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_YOUR_SECRET_HERE');
  console.log('');
  console.log('8. Redeploy webhook function:');
  console.log('   npx supabase functions deploy stripe-webhook');
  console.log('');
}

checkPaymentFlow().catch(console.error);
