#!/usr/bin/env node
/**
 * StockX Auth Probe
 *
 * Diagnoses authentication issues by:
 * 1. Checking environment and Supabase connectivity
 * 2. Reading refresh token from database
 * 3. Attempting ONE token refresh
 * 4. Reporting status (no token values printed)
 *
 * Exit codes:
 *   0 = Success
 *   1 = Failure
 *
 * Usage: node scripts/stockx_auth_probe.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

// ============================================
// CONFIGURATION
// ============================================
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const STOCKX_CLIENT_ID = process.env.STOCKX_CLIENT_ID;
const STOCKX_CLIENT_SECRET = process.env.STOCKX_CLIENT_SECRET;
const TOKEN_URL = 'https://accounts.stockx.com/oauth/token';

// ============================================
// HELPERS
// ============================================
function getSupabaseHost() {
  try {
    return new URL(SUPABASE_URL).host;
  } catch {
    return '(invalid URL)';
  }
}

// ============================================
// MAIN PROBE
// ============================================
async function runProbe() {
  const results = {
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    supabaseHost: getSupabaseHost(),
    envVars: {
      SUPABASE_URL: !!SUPABASE_URL,
      SUPABASE_SERVICE_KEY: !!SUPABASE_SERVICE_KEY,
      STOCKX_CLIENT_ID: !!STOCKX_CLIENT_ID,
      STOCKX_CLIENT_SECRET: !!STOCKX_CLIENT_SECRET
    },
    dbConnection: false,
    dbTokenFound: false,
    tokenAgeMinutes: null,
    refreshAttempt: {
      status: null,
      ok: false,
      error: null,
      errorBody: null
    }
  };

  console.log('\n' + '='.repeat(60));
  console.log('  STOCKX AUTH PROBE');
  console.log('='.repeat(60));
  console.log(`  Timestamp: ${results.timestamp}`);
  console.log(`  Node: ${results.nodeVersion}`);
  console.log(`  Supabase Host: ${results.supabaseHost}`);
  console.log('');
  console.log('  Environment Variables:');
  Object.entries(results.envVars).forEach(([key, present]) => {
    console.log(`    ${key}: ${present ? '✓ SET' : '✗ MISSING'}`);
  });
  console.log('='.repeat(60));

  // Check required env vars
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('\n[FATAL] Missing Supabase credentials');
    return { ...results, ok: false, error: 'Missing Supabase credentials' };
  }

  if (!STOCKX_CLIENT_ID || !STOCKX_CLIENT_SECRET) {
    console.error('\n[FATAL] Missing StockX OAuth credentials');
    return { ...results, ok: false, error: 'Missing StockX OAuth credentials' };
  }

  // Connect to Supabase
  console.log('\n[1/3] Connecting to Supabase...');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const { data, error } = await supabase.rpc('get_stockx_tokens');

    if (error) {
      console.error(`  ✗ DB Error: ${error.message}`);
      return { ...results, ok: false, error: `DB Error: ${error.message}` };
    }

    results.dbConnection = true;
    console.log('  ✓ Connected to Supabase');

    const tokens = data?.[0];

    if (tokens?.refresh_token) {
      results.dbTokenFound = true;
      results.tokenAgeMinutes = tokens.refresh_token_updated_at
        ? Math.round((Date.now() - new Date(tokens.refresh_token_updated_at).getTime()) / 1000 / 60)
        : null;
      console.log(`  ✓ Refresh token found in DB`);
      console.log(`    Token age: ${results.tokenAgeMinutes !== null ? results.tokenAgeMinutes + ' minutes' : 'unknown'}`);
    } else {
      console.error('  ✗ No refresh token available in database');
      return { ...results, ok: false, error: 'No refresh token available in database' };
    }
  } catch (err) {
    console.error(`  ✗ Exception: ${err.message}`);
    return { ...results, ok: false, error: err.message };
  }

  // Get refresh token (DB only)
  let refreshToken = null;
  try {
    const { data } = await supabase.rpc('get_stockx_tokens');
    refreshToken = data?.[0]?.refresh_token || null;
  } catch {
    refreshToken = null;
  }

  if (!refreshToken) {
    console.error('\n[FATAL] No refresh token available in database');
    return { ...results, ok: false, error: 'No refresh token available in database' };
  }

  // Attempt token refresh
  console.log('\n[2/3] Attempting StockX token refresh...');
  console.log(`  URL: ${TOKEN_URL}`);
  console.log(`  Grant Type: refresh_token`);
  console.log(`  Auth: Basic (client_id:client_secret)`);

  try {
    const basicAuth = Buffer.from(`${STOCKX_CLIENT_ID}:${STOCKX_CLIENT_SECRET}`).toString('base64');

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    });

    results.refreshAttempt.status = response.status;

    const responseText = await response.text();
    let responseBody;
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      responseBody = { raw: responseText.slice(0, 200) };
    }

    console.log(`  Response Status: ${response.status}`);

    if (response.ok) {
      results.refreshAttempt.ok = true;
      console.log('  ✓ Token refresh SUCCESSFUL');
      console.log(`    Access token received: ${responseBody.access_token ? 'YES' : 'NO'}`);
      console.log(`    Refresh token received: ${responseBody.refresh_token ? 'YES' : 'NO'}`);
      console.log(`    Expires in: ${responseBody.expires_in} seconds`);

      // Save the new tokens to DB
      if (responseBody.refresh_token) {
        console.log('\n[3/3] Saving new tokens to database...');
        const expiresAt = new Date(Date.now() + responseBody.expires_in * 1000);
        const { error: saveError } = await supabase.rpc('update_stockx_tokens', {
          p_access_token: responseBody.access_token,
          p_access_token_expires_at: expiresAt.toISOString(),
          p_refresh_token: responseBody.refresh_token
        });

        if (saveError) {
          console.error(`  ✗ Failed to save: ${saveError.message}`);
        } else {
          console.log('  ✓ New tokens saved to database');
        }
      }

    } else {
      results.refreshAttempt.ok = false;
      results.refreshAttempt.error = responseBody.error || 'Unknown error';
      results.refreshAttempt.errorBody = {
        error: responseBody.error,
        description: responseBody.error_description
      };
      console.error('  ✗ Token refresh FAILED');
      console.error(`    Error: ${responseBody.error}`);
      console.error(`    Description: ${responseBody.error_description}`);
    }

  } catch (err) {
    results.refreshAttempt.error = err.message;
    console.error(`  ✗ Request failed: ${err.message}`);
  }

  // Final summary
  console.log('\n' + '='.repeat(60));
  if (results.refreshAttempt.ok) {
    console.log('  RESULT: ✓ SUCCESS');
    console.log('='.repeat(60));
    console.log('\n  The worker should be able to authenticate now.\n');
    return { ...results, ok: true };
  } else {
    console.log('  RESULT: ✗ FAILED');
    console.log('='.repeat(60));
    console.log('\n  Troubleshooting:');
    console.log('  1. Verify StockX API credentials are correct');
    console.log('  2. Check if refresh token has expired (need new login)');
    console.log('  3. Ensure Supabase RPC functions exist (run migrations)');
    console.log('');
    return { ...results, ok: false };
  }
}

// ============================================
// RUN
// ============================================
runProbe()
  .then((results) => {
    process.exit(results.ok ? 0 : 1);
  })
  .catch((err) => {
    console.error('\n[FATAL]', err);
    process.exit(1);
  });
