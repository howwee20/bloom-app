require('dotenv').config({ path: require('path').join(__dirname, '../price-worker/.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function main() {
  // Samba OG Brown Putty Grey - Image from Adidas
  const token = {
    sku: 'ID1481',
    product_name: 'adidas Samba OG Brown Putty Grey',
    size: '10',
    product_image_url: 'https://images.stockx.com/images/adidas-Samba-OG-Brown-Putty-Grey-Product.jpg',
    purchase_price: 106.00,
    current_value: 112.00, // Current StockX ask
    custody_type: 'home',
    status: 'in_custody',
    is_exchange_eligible: false,
    vault_location: null,
  };

  // Get user ID for howeeva1
  const { data: user, error: userError } = await supabase
    .from('profile')
    .select('id')
    .eq('username', 'howeeva1')
    .single();

  if (userError || !user) {
    console.error('User not found:', userError?.message);
    return;
  }

  console.log('Found user:', user.id);

  // Insert token
  const { data, error } = await supabase
    .from('tokens')
    .insert({
      user_id: user.id,
      order_id: null,
      ...token,
      purchase_date: new Date().toISOString(),
      value_updated_at: new Date().toISOString(),
      is_listed_for_sale: false,
    })
    .select()
    .single();

  if (error) {
    console.error('Insert error:', error.message);
    return;
  }

  console.log('\nSamba token added!');
  console.log('Token ID:', data.id);
  console.log('Product:', data.product_name);
  console.log('Size:', data.size);
  console.log('Purchase Price: $' + data.purchase_price);
  console.log('Current Value: $' + data.current_value);
  console.log('Custody:', data.custody_type);
  console.log('P&L: +$' + (data.current_value - data.purchase_price).toFixed(2));
}

main();
