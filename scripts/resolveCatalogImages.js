#!/usr/bin/env node
/**
 * Resolve catalog images using SneaksAPI
 * Then upload to Supabase Storage
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const SneaksAPI = require('sneaks-api');

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
const sneaks = new SneaksAPI();

// Search for product and get image
function searchProduct(query) {
  return new Promise((resolve, reject) => {
    sneaks.getProducts(query, 1, (err, products) => {
      if (err) {
        reject(err);
        return;
      }
      if (!products || products.length === 0) {
        reject(new Error('No products found'));
        return;
      }
      const product = products[0];
      const imageUrl = product.thumbnail || product.image?.thumbnail;
      if (!imageUrl) {
        reject(new Error('No image in product data'));
        return;
      }
      resolve(imageUrl);
    });
  });
}

// Download image as buffer
async function downloadImage(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'accept': 'image/*',
    },
  });

  if (!res.ok) {
    throw new Error(`Download failed: ${res.status}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// Upload image to Supabase Storage
async function uploadToStorage(buffer, styleCode) {
  const filename = `${styleCode.replace(/[^a-zA-Z0-9-]/g, '_')}.jpg`;
  const filePath = `shoes/${filename}`;

  const { error } = await supabase.storage
    .from('catalog-images')
    .upload(filePath, buffer, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  const { data: { publicUrl } } = supabase.storage
    .from('catalog-images')
    .getPublicUrl(filePath);

  return publicUrl;
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  console.log('[START] Resolving catalog images via SneaksAPI...\n');

  const { data: items, error: fetchError } = await supabase
    .from('catalog_items')
    .select('id, style_code, display_name')
    .is('image_url_thumb', null)  // Only items without images
    .order('popularity_rank', { ascending: true });

  if (fetchError) {
    console.error('[FATAL] Failed to fetch catalog items:', fetchError.message);
    process.exit(1);
  }

  // Also get items with existing bad URLs
  const { data: allItems, error: allError } = await supabase
    .from('catalog_items')
    .select('id, style_code, display_name, image_url_thumb')
    .order('popularity_rank', { ascending: true });

  if (allError) {
    console.error('[FATAL] Failed to fetch all catalog items:', allError.message);
    process.exit(1);
  }

  // Filter to items that need images (null or don't start with our supabase URL)
  const needsImages = allItems.filter(item => {
    if (!item.image_url_thumb) return true;
    // Skip if already has a valid Supabase storage URL
    if (item.image_url_thumb.includes('supabase.co/storage')) return false;
    return true;
  });

  console.log(`[INFO] Found ${needsImages.length} items needing images\n`);

  let success = 0;
  let failed = 0;
  const failedItems = [];

  for (let i = 0; i < needsImages.length; i++) {
    const item = needsImages[i];
    const { style_code, display_name } = item;

    console.log(`[${i + 1}/${needsImages.length}] ${style_code}`);

    try {
      // Search using style code first
      let imageUrl;
      try {
        imageUrl = await searchProduct(style_code);
      } catch {
        // Fallback to display name
        const searchName = display_name.replace(/\([^)]+\)/g, '').trim();
        imageUrl = await searchProduct(searchName);
      }

      console.log(`  Found: ${imageUrl.substring(0, 50)}...`);

      // Download image
      const imageBuffer = await downloadImage(imageUrl);
      console.log(`  Downloaded: ${imageBuffer.length} bytes`);

      // Upload to Supabase
      const publicUrl = await uploadToStorage(imageBuffer, style_code);
      console.log(`  Uploaded`);

      // Update database
      const { error: updateError } = await supabase
        .from('catalog_items')
        .update({ image_url_thumb: publicUrl })
        .eq('id', item.id);

      if (updateError) {
        throw new Error(`DB update failed: ${updateError.message}`);
      }

      console.log(`  ✓ Success\n`);
      success++;

      // Rate limit
      await delay(500);

    } catch (err) {
      console.log(`  ✗ Failed: ${err.message}\n`);
      failed++;
      failedItems.push({ style_code, display_name });
      await delay(200);
    }
  }

  console.log(`\n[DONE] Success: ${success}, Failed: ${failed}`);

  if (failedItems.length > 0 && failedItems.length <= 20) {
    console.log(`\n[FAILED ITEMS]`);
    failedItems.forEach((item) => console.log(`  - ${item.style_code}: ${item.display_name}`));
  }
}

run().catch((err) => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
