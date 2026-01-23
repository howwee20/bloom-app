import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { after, before, beforeEach, test } from 'node:test';
import { supabaseAdmin } from '../lib/server/supabaseAdmin';
import { ColumnAdapter } from '../lib/engine/integrations/column';
import { BrokerageAdapter } from '../lib/engine/integrations/brokerage';
import { SpendableEngine } from '../lib/engine/spendable';
import { CardService } from '../lib/engine/card';

const TEST_PASSWORD = 'testpass123';

async function unwrap<T>(promise: Promise<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}

async function ensureTestUser(): Promise<string> {
  const email = `ledger-test-${randomUUID()}@bloom.local`;
  const created = await supabaseAdmin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });

  if (created.error || !created.data?.user) {
    throw created.error || new Error('Unable to create test user');
  }

  return created.data.user.id;
}

async function clearUserData(userId: string) {
  const tables = [
    'card_holds',
    'card_auths',
    'receipts',
    'orders',
    'positions',
    'ledger_journal_entries',
    'ledger_accounts',
    'policy',
    'raw_events',
    'normalized_events',
    'liquidation_jobs',
    'ach_transfers',
    'reconciliation_reports',
    'internal_alerts',
  ];

  for (const table of tables) {
    const { error } = await supabaseAdmin.from(table).delete().eq('user_id', userId);
    if (error) throw error;
  }
}

let userId = '';

before(async () => {
  userId = await ensureTestUser();
});

after(async () => {
  if (!userId) return;
  await clearUserData(userId);
  await supabaseAdmin.auth.admin.deleteUser(userId);
});

beforeEach(async () => {
  if (!userId) return;
  await clearUserData(userId);
});

test('computeSpendableNow respects active holds and buffer', async () => {
  const column = new ColumnAdapter();
  const spendable = new SpendableEngine();

  const policyInsert = await supabaseAdmin.from('policy').upsert({
    user_id: userId,
    buffer_cents: 1500,
    buffer_percent: null,
    liquidation_order_json: [],
    bridge_enabled_bool: false,
  }, { onConflict: 'user_id' });
  if (policyInsert.error) throw policyInsert.error;

  await column.handleAchEvent({
    external_id: `ach-${randomUUID()}`,
    user_id: userId,
    amount_cents: 10000,
    direction: 'credit',
  });

  const holdInsert = await supabaseAdmin.from('card_holds').insert([
    {
      user_id: userId,
      merchant_name: 'Active Hold',
      amount_cents: 2000,
      status: 'active',
      external_auth_id: `auth-${randomUUID()}`,
    },
    {
      user_id: userId,
      merchant_name: 'Expired Hold',
      amount_cents: 1000,
      status: 'expired',
      external_auth_id: `auth-${randomUUID()}`,
    },
  ]);
  if (holdInsert.error) throw holdInsert.error;

  const result = await spendable.computeSpendableNow(userId);
  assert.equal(result.spendable_cents, 10000 - 2000 - 1500);
});

test('column webhooks are idempotent', async () => {
  const column = new ColumnAdapter();

  // First deposit funds so auth requests can be approved
  await column.handleAchEvent({
    external_id: `ach-${randomUUID()}`,
    user_id: userId,
    amount_cents: 10000,
    direction: 'credit',
  });

  const authExternalId = `auth-${randomUUID()}`;
  await column.handleAuthRequest({
    external_id: authExternalId,
    user_id: userId,
    merchant_name: 'Test Merchant',
    amount_cents: 500,
  });
  await column.handleAuthRequest({
    external_id: authExternalId,
    user_id: userId,
    merchant_name: 'Test Merchant',
    amount_cents: 500,
  });

  const holds = await unwrap(
    supabaseAdmin
      .from('card_holds')
      .select('id')
      .eq('external_auth_id', authExternalId)
  );
  assert.equal(holds.length, 1);

  const authReceipts = await unwrap(
    supabaseAdmin
      .from('receipts')
      .select('id')
      .eq('user_id', userId)
      .contains('metadata_json', { external_id: authExternalId })
  );
  assert.equal(authReceipts.length, 1);

  const txnExternalId = `txn-${randomUUID()}`;
  await column.handleTransactionPosted({
    external_id: txnExternalId,
    user_id: userId,
    merchant_name: 'Test Merchant',
    amount_cents: 500,
    auth_id: authExternalId,
  });
  await column.handleTransactionPosted({
    external_id: txnExternalId,
    user_id: userId,
    merchant_name: 'Test Merchant',
    amount_cents: 500,
    auth_id: authExternalId,
  });

  const entries = await unwrap(
    supabaseAdmin
      .from('ledger_journal_entries')
      .select('id')
      .eq('external_source', 'card')
      .eq('external_id', txnExternalId)
  );
  assert.equal(entries.length, 1);

  const txnReceipts = await unwrap(
    supabaseAdmin
      .from('receipts')
      .select('id')
      .eq('user_id', userId)
      .contains('metadata_json', { external_id: txnExternalId })
  );
  assert.equal(txnReceipts.length, 1);
});

test('flow: deposit, trade, auth, settlement, refund', async () => {
  const column = new ColumnAdapter();
  const brokerage = new BrokerageAdapter();
  const card = new CardService();
  const spendable = new SpendableEngine();

  await column.handleAchEvent({
    external_id: `ach-${randomUUID()}`,
    user_id: userId,
    amount_cents: 20000,
    direction: 'credit',
  });

  const order = await brokerage.placeOrder({
    user_id: userId,
    symbol: 'SPY',
    side: 'buy',
    notional_cents: 5000,
    idempotency_key: `order-${randomUUID()}`,
  });
  await brokerage.fillOrder(order);

  const authExternalId = `auth-${randomUUID()}`;
  await card.handleAuthRequest({
    external_id: authExternalId,
    user_id: userId,
    merchant_name: 'Blue Bottle',
    amount_cents: 1200,
  }, { source: 'test' });

  await card.handleSettlement({
    external_id: `txn-${randomUUID()}`,
    user_id: userId,
    merchant_name: 'Blue Bottle',
    amount_cents: 1200,
    auth_id: authExternalId,
  }, { source: 'test' });

  await card.handleRefund({
    external_id: `refund-${randomUUID()}`,
    user_id: userId,
    merchant_name: 'Blue Bottle',
    amount_cents: 600,
    auth_id: authExternalId,
  }, { source: 'test' });

  const result = await spendable.computeSpendableNow(userId);
  assert.equal(result.spendable_cents, 20000 - 5000 - 1200 + 600);

  const receipts = await unwrap(
    supabaseAdmin
      .from('receipts')
      .select('type')
      .eq('user_id', userId)
  );
  const types = receipts.map((row) => row.type);
  assert.ok(types.includes('deposit_posted'));
  assert.ok(types.includes('trade_filled'));
  assert.ok(types.includes('auth_hold'));
  assert.ok(types.includes('settlement'));
  assert.ok(types.includes('refund'));
});

test('out-of-order card events converge', async () => {
  const card = new CardService();

  const authId = `auth-${randomUUID()}`;
  await card.handleSettlement({
    external_id: `settle-${randomUUID()}`,
    user_id: userId,
    merchant_name: 'Notion',
    amount_cents: 2500,
    auth_id: authId,
  }, { source: 'test' });

  await card.handleAuthRequest({
    external_id: authId,
    user_id: userId,
    merchant_name: 'Notion',
    amount_cents: 2500,
  }, { source: 'test' });

  const authState = await unwrap(
    supabaseAdmin
      .from('card_auths')
      .select('status, captured_cents')
      .eq('auth_id', authId)
      .single()
  );

  assert.equal(authState.status, 'settled');
  assert.equal(Number(authState.captured_cents), 2500);
});
