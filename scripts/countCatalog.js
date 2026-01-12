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

(async () => {
  const { count, error } = await supabase.from('catalog_items').select('*', { count: 'exact', head: true });
  if (error) console.error('Error:', error.message);
  else console.log('Total catalog items:', count);
})();
