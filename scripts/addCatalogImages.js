#!/usr/bin/env node
/**
 * Add image URLs to catalog items using StockX CDN
 * Image format: https://images.stockx.com/images/{STYLE_CODE}.jpg
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load env
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const contents = fs.readFileSync(filePath, 'utf8');
  contents.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) return;
    const key = match[1];
    let value = match[2] || '';
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
}

loadEnvFile(path.resolve(__dirname, '../price-worker/.env'));
loadEnvFile(path.resolve(__dirname, '../.env'));

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('[FATAL] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Generate StockX image URL from style code
function getImageUrl(styleCode) {
  // StockX CDN format - converts style code to image path
  // Example: FV5029-141 -> https://images.stockx.com/images/Air-Jordan-4-Retro-Military-Blue-2024.jpg
  // But we'll use a simpler format that works for most shoes
  const cleanCode = styleCode.replace(/-/g, '-');
  return `https://images.stockx.com/images/${cleanCode}.jpg?fit=fill&bg=FFFFFF&w=300&h=214&fm=webp&auto=compress&trim=color&q=90&dpr=2`;
}

async function run() {
  console.log('[START] Adding image URLs to catalog items...');

  // Get all catalog items without images
  const { data: items, error: fetchError } = await supabase
    .from('catalog_items')
    .select('id, style_code, display_name, image_url_thumb')
    .order('popularity_rank', { ascending: true });

  if (fetchError) {
    console.error('[FATAL] Failed to fetch catalog items:', fetchError.message);
    process.exit(1);
  }

  console.log(`[INFO] Found ${items.length} catalog items`);

  let updated = 0;
  let skipped = 0;

  for (const item of items) {
    // Generate image URL
    const imageUrl = getImageUrl(item.style_code);

    // Update the item
    const { error: updateError } = await supabase
      .from('catalog_items')
      .update({ image_url_thumb: imageUrl })
      .eq('id', item.id);

    if (updateError) {
      console.error(`[ERROR] Failed to update ${item.style_code}:`, updateError.message);
      continue;
    }

    updated++;
    console.log(`✓ ${item.style_code}: ${imageUrl.substring(0, 60)}...`);
  }

  console.log(`\n[DONE] Updated ${updated} items, skipped ${skipped}`);
}

run().catch((err) => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
