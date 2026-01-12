const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function loadEnv(fp) {
  if (!fs.existsSync(fp)) return;
  fs.readFileSync(fp, 'utf8').split('\n').forEach(line => {
    const m = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) {
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"'))) v = v.slice(1,-1);
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
  });
}

loadEnv(path.join(__dirname, '../price-worker/.env'));
loadEnv(path.join(__dirname, '../.env'));

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

function generateDisplayName(item) {
  const parts = [];
  if (item.brand && item.brand !== 'Jordan') parts.push(item.brand);
  parts.push(item.model);
  if (item.colorway_name) parts.push(item.colorway_name);
  return parts.join(' ');
}

(async () => {
  const batchFile = process.argv[2];
  if (!batchFile) {
    console.error('Usage: node seedCatalog.js <batch-file.json>');
    process.exit(1);
  }

  const items = JSON.parse(fs.readFileSync(batchFile, 'utf8'));
  console.log(`Loaded ${items.length} items from ${batchFile}`);

  // Get existing style codes to skip duplicates
  const { data: existing } = await supabase
    .from('catalog_items')
    .select('style_code');
  const existingCodes = new Set((existing || []).map(e => e.style_code));

  let inserted = 0;
  let skipped = 0;

  for (const item of items) {
    if (existingCodes.has(item.style_code)) {
      console.log(`Skipping duplicate: ${item.style_code}`);
      skipped++;
      continue;
    }

    const display_name = generateDisplayName(item);
    const { error } = await supabase.from('catalog_items').insert({
      brand: item.brand,
      model: item.model,
      colorway_name: item.colorway_name,
      style_code: item.style_code,
      release_year: item.release_year || null,
      display_name,
      popularity_rank: 1000 // Default rank
    });

    if (error) {
      console.error(`Error inserting ${item.style_code}:`, error.message);
    } else {
      console.log(`Inserted: ${display_name}`);
      inserted++;
    }
  }

  console.log(`\nDone! Inserted: ${inserted}, Skipped: ${skipped}`);
})();
