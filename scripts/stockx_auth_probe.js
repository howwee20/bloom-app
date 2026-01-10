#!/usr/bin/env node
/**
 * StockX Auth Probe (Root Runner)
 *
 * Loads env from price-worker/.env and performs a single refresh test.
 * Exits 0 on success, 1 on failure.
 *
 * Usage: node scripts/stockx_auth_probe.js
 */

const fs = require('fs');
const path = require('path');

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

loadEnvFile(path.resolve(__dirname, '../price-worker/.env'));

const { createClient } = require('@supabase/supabase-js');
const stockx = require('../price-worker/lib/stockx');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('[FATAL] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
stockx.init(supabase);

async function run() {
  const health = await stockx.getTokenHealth();

  const result = {
    ok: !!health.ok,
    status: health.refreshTest?.status ?? null,
    refreshTokenAgeMinutes: health.refreshTokenAge ?? null,
    hasRefreshToken: !!health.hasRefreshToken,
    hasClientId: !!health.hasClientId,
    hasClientSecret: !!health.hasClientSecret,
    timestamp: new Date().toISOString()
  };

  console.log(JSON.stringify(result, null, 2));
  process.exit(health.ok ? 0 : 1);
}

run().catch((err) => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
