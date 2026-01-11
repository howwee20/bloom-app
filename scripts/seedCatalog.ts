#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

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

loadEnvFile(path.resolve(__dirname, '../.env'));

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('[FATAL] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function chunk(list, size) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size));
  }
  return chunks;
}

async function run() {
  const filePath = path.resolve(__dirname, '../catalog/top100.json');
  const raw = fs.readFileSync(filePath, 'utf8');
  const items = JSON.parse(raw);

  if (!Array.isArray(items) || items.length === 0) {
    console.error('[FATAL] No catalog items found in catalog/top100.json');
    process.exit(1);
  }

  const payload = items.map((item) => ({
    brand: item.brand,
    model: item.model,
    colorway_name: item.colorway_name,
    display_name: item.display_name,
    style_code: item.style_code,
    release_year: item.release_year ?? null,
    image_url_thumb: item.image_url_thumb ?? null,
    aliases: item.aliases ?? null,
    popularity_rank: item.popularity_rank
  }));

  const batches = chunk(payload, 25);
  let totalUpserted = 0;

  for (const batch of batches) {
    const { error } = await supabase
      .from('catalog_items')
      .upsert(batch, { onConflict: 'style_code' });

    if (error) {
      console.error('[ERROR] Upsert failed:', error.message);
      process.exit(1);
    }

    totalUpserted += batch.length;
  }

  console.log(`[DONE] Upserted ${totalUpserted} catalog items`);
}

run().catch((err) => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
