#!/usr/bin/env node
/**
 * Seed StockX Token from Environment Variable
 *
 * Copies the current STOCKX_REFRESH_TOKEN env var to the database.
 * Use this once to migrate from env-based tokens to database-based tokens.
 *
 * After running this script:
 * - The price-worker will read/write tokens from the database
 * - You can remove STOCKX_REFRESH_TOKEN from Railway env vars
 * - Tokens will auto-rotate and persist across runs
 *
 * Usage: node seed-stockx-token.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const STOCKX_REFRESH_TOKEN = process.env.STOCKX_REFRESH_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('[ERROR] Missing Supabase credentials');
  console.error('  Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (!STOCKX_REFRESH_TOKEN) {
  console.error('[ERROR] Missing STOCKX_REFRESH_TOKEN environment variable');
  console.error('  Set this to your current valid refresh token');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('  STOCKX TOKEN SEEDING');
  console.log('='.repeat(60));

  console.log('\n[SEED] Copying refresh token from env to database...');
  console.log(`[SEED] Token preview: ${STOCKX_REFRESH_TOKEN.slice(0, 20)}...`);

  const { error } = await supabase.rpc('update_stockx_tokens', {
    p_access_token: null,
    p_access_token_expires_at: null,
    p_refresh_token: STOCKX_REFRESH_TOKEN
  });

  if (error) {
    console.error('\n[ERROR] Failed to save token:', error.message);
    console.error('\nPossible causes:');
    console.error('  1. Migration not run yet (run: supabase db push)');
    console.error('  2. RPC function not created');
    console.error('  3. Service role key issue');
    process.exit(1);
  }

  // Verify it was saved
  const { data: verify, error: verifyError } = await supabase.rpc('get_stockx_tokens');

  if (verifyError || !verify?.[0]?.refresh_token) {
    console.error('\n[WARN] Token saved but verification failed');
    console.error('  This may be a permissions issue');
  } else {
    console.log('[SEED] Verified: token is now in database');
  }

  console.log('\n' + '='.repeat(60));
  console.log('  SUCCESS');
  console.log('='.repeat(60));
  console.log('\nThe price-worker will now:');
  console.log('  1. Read the refresh token from the database');
  console.log('  2. Use it to get new access tokens');
  console.log('  3. Save rotated refresh tokens back to database');
  console.log('\nYou can now remove STOCKX_REFRESH_TOKEN from Railway env vars.');
  console.log('\nTo verify, run: node runOnce.js --limit=1');
  console.log('');
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
