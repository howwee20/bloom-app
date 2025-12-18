// Test all asset image URLs and report which ones work
// Usage: node scripts/test-images.js

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testImageUrl(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      }
    });

    clearTimeout(timeout);
    return response.ok;
  } catch (error) {
    return false;
  }
}

async function main() {
  console.log('Fetching assets from database...\n');

  const { data: assets, error } = await supabase
    .from('assets')
    .select('id, name, image_url, price, category, brand')
    .or('status.eq.listed,owner_id.is.null')
    .order('price', { ascending: true });

  if (error) {
    console.error('Error fetching assets:', error);
    process.exit(1);
  }

  console.log(`Found ${assets.length} assets to test\n`);

  const working = [];
  const broken = [];

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    const isWorking = asset.image_url ? await testImageUrl(asset.image_url) : false;

    const status = isWorking ? '✅' : '❌';
    const price = `$${asset.price.toFixed(2)}`;
    console.log(`[${i + 1}/${assets.length}] ${status} ${price.padEnd(10)} ${asset.name}`);

    if (isWorking) {
      working.push(asset);
    } else {
      broken.push(asset);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Working images: ${working.length}`);
  console.log(`❌ Broken images: ${broken.length}`);

  // Output broken IDs for deletion
  if (broken.length > 0) {
    console.log('\n' + '='.repeat(60));
    console.log('BROKEN ITEMS (IDs for deletion)');
    console.log('='.repeat(60));
    broken.forEach(item => {
      console.log(`'${item.id}', -- ${item.name}`);
    });

    console.log('\n-- SQL to delete broken items:');
    console.log(`DELETE FROM public.assets WHERE id IN (`);
    console.log(broken.map(item => `  '${item.id}'`).join(',\n'));
    console.log(');');
  }

  // Output working items summary by category
  console.log('\n' + '='.repeat(60));
  console.log('WORKING ITEMS BY CATEGORY');
  console.log('='.repeat(60));

  const byCategory = {};
  working.forEach(item => {
    const cat = item.category || 'Unknown';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
  });

  for (const [category, items] of Object.entries(byCategory)) {
    console.log(`\n${category} (${items.length} items):`);
    items.forEach(item => {
      console.log(`  $${item.price.toFixed(2).padEnd(8)} ${item.name}`);
    });
  }

  // Price tier breakdown
  console.log('\n' + '='.repeat(60));
  console.log('WORKING ITEMS BY PRICE TIER');
  console.log('='.repeat(60));

  const entry = working.filter(i => i.price < 150);
  const mid = working.filter(i => i.price >= 150 && i.price < 300);
  const premium = working.filter(i => i.price >= 300);

  console.log(`Entry ($80-150): ${entry.length} items`);
  console.log(`Mid ($150-300): ${mid.length} items`);
  console.log(`Premium ($300+): ${premium.length} items`);
}

main().catch(console.error);
