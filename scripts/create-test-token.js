// Script to create a test token for a user
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing env vars. Need EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createTestToken() {
  const userEmail = 'howeeva1@msu.edu';
  
  // 1. Find the user
  const { data: users, error: userError } = await supabase.auth.admin.listUsers();
  
  if (userError) {
    console.error('Error listing users:', userError);
    return;
  }
  
  const user = users.users.find(u => u.email === userEmail);
  
  if (!user) {
    console.error(`User with email ${userEmail} not found`);
    console.log('Available users:', users.users.map(u => u.email));
    return;
  }
  
  console.log(`Found user: ${user.id} (${user.email})`);
  
  // 2. Get the Black Cat J4 asset
  const { data: asset, error: assetError } = await supabase
    .from('assets')
    .select('*')
    .ilike('name', '%Black Cat%')
    .single();
  
  if (assetError || !asset) {
    console.error('Black Cat asset not found:', assetError);
    return;
  }
  
  console.log(`Found asset: ${asset.name} (${asset.id})`);
  console.log(`Price: $${asset.price}, SKU: ${asset.stockx_sku}`);
  
  // 3. Check if user already has a token for this asset
  const { data: existingToken } = await supabase
    .from('tokens')
    .select('*')
    .eq('user_id', user.id)
    .eq('sku', asset.stockx_sku)
    .maybeSingle();
  
  if (existingToken) {
    console.log('User already has this token:', existingToken.id);
    console.log('Token status:', existingToken.status);
    console.log('Exchange eligible:', existingToken.is_exchange_eligible);
    return;
  }
  
  // 4. Create a test token (simulating a completed purchase)
  const tokenData = {
    user_id: user.id,
    order_id: null, // No real order for test token
    sku: asset.stockx_sku || 'DH7138-006',
    product_name: asset.name,
    size: asset.size || '10',
    product_image_url: asset.image_url,
    purchase_price: asset.price,
    purchase_date: new Date().toISOString(),
    custody_type: 'bloom',
    vault_location: 'Bloom Vault - Detroit',
    verified_at: new Date().toISOString(),
    is_exchange_eligible: true, // Make it eligible for exchange!
    current_value: asset.price,
    value_updated_at: new Date().toISOString(),
    status: 'in_custody', // Already in custody, ready to trade
  };
  
  const { data: token, error: tokenError } = await supabase
    .from('tokens')
    .insert(tokenData)
    .select()
    .single();
  
  if (tokenError) {
    console.error('Error creating token:', tokenError);
    return;
  }
  
  console.log('\n✅ Test token created successfully!');
  console.log('Token ID:', token.id);
  console.log('Product:', token.product_name);
  console.log('Size:', token.size);
  console.log('Status:', token.status);
  console.log('Exchange Eligible:', token.is_exchange_eligible);
  console.log('\nYou can now see this token in your portfolio and list it on the exchange!');
}

createTestToken();
