import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { after, before, beforeEach, test } from 'node:test';
import { supabaseAdmin } from '../lib/server/supabaseAdmin';
import { ColumnAdapter } from '../lib/engine/integrations/column';
import { AlpacaBrokerageAdapter, BrokerageAdapter, PaperBrokerageAdapter } from '../lib/engine/integrations/brokerage';
import { SpendableEngine } from '../lib/engine/spendable';
import { CardService } from '../lib/engine/card';
import { CommandService } from '../lib/engine/command';
import { requireCronSecret } from '../lib/server/cronAuth';
import { MetricsService } from '../lib/engine/metrics';
import { LiquidationEngine } from '../lib/engine/liquidation';
import { ReconciliationService } from '../lib/engine/reconcile';
import { EventStore } from '../lib/engine/eventStore';
import { ReceiptBuilder } from '../lib/engine/receipts';
import commandPreviewHandler from '../api/command';

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
    'external_links',
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
    'metrics_snapshots',
  ];

  for (const table of tables) {
    const { error } = await supabaseAdmin.from(table).delete().eq('user_id', userId);
    if (error) throw error;
  }
}

function createMockRes() {
  return {
    statusCode: 200,
    body: null as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
  };
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

const hasAlpaca = !!(process.env.ALPACA_API_KEY || process.env.ALPACA_KEY);

test('alpaca adapter connectivity', { skip: !hasAlpaca }, async () => {
  const symbol = process.env.BLOOM_STOCK_TICKER || 'SPY';
  const adapter = new AlpacaBrokerageAdapter();
  const quote = await adapter.getQuote(symbol);
  assert.ok(quote.price_cents >= 0);
});

test('command dd/card details are graceful when not linked', async () => {
  const command = new CommandService();

  const ddPreview = await command.preview(userId, 'dd details');
  assert.equal(ddPreview.status, 'not_linked');
  assert.equal(ddPreview.next_step, 'create_account');

  const cardPreview = await command.preview(userId, 'card status');
  assert.equal(cardPreview.status, 'not_linked');
  assert.equal(cardPreview.next_step, 'issue_card');

  const ddConfirm = await command.confirm(userId, {
    action: 'dd_details',
    idempotency_key: `dd-${randomUUID()}`,
  } as any);
  assert.equal(ddConfirm.ok, false);
  assert.equal(ddConfirm.status, 'not_linked');

  const cardConfirm = await command.confirm(userId, {
    action: 'card_status',
    idempotency_key: `card-${randomUUID()}`,
  } as any);
  assert.equal(cardConfirm.ok, false);
  assert.equal(cardConfirm.status, 'not_linked');
});

test('api/command shim matches preview', async () => {
  const command = new CommandService();
  const preview = await command.preview(userId, 'balance');

  const req = {
    method: 'POST',
    headers: { 'x-user-id': userId },
    body: { text: 'balance' },
  } as any;
  const res = createMockRes();

  await commandPreviewHandler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body?.action, preview.action);
  assert.equal(res.body?.confirm_required, preview.confirm_required);
  assert.equal(res.body?.preview_title, preview.preview_title);
  assert.ok(typeof res.body?.idempotency_key === 'string');
});

test('cron auth accepts header and query param', () => {
  const original = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'test-secret';

  const bearerOk = requireCronSecret({ headers: { authorization: 'Bearer test-secret' } });
  assert.equal(bearerOk.ok, true);

  const headerOk = requireCronSecret({ headers: { 'x-cron-secret': 'test-secret' } });
  assert.equal(headerOk.ok, true);

  const queryOk = requireCronSecret({ query: { cron_secret: 'test-secret' } });
  assert.equal(queryOk.ok, true);

  const bad = requireCronSecret({ headers: { 'x-cron-secret': 'wrong' } });
  assert.equal(bad.ok, false);

  process.env.CRON_SECRET = original;
});

test('metrics are best-effort', async () => {
  const originalFrom = (supabaseAdmin as any).from;
  (supabaseAdmin as any).from = () => {
    throw new Error('metrics down');
  };

  const metrics = new MetricsService();
  await metrics.record({ name: 'test_metric', value: 1 });

  (supabaseAdmin as any).from = originalFrom;
});

test('liquidation/reconcile are idempotent for ledger', async () => {
  await supabaseAdmin.from('policy').upsert({
    user_id: userId,
    buffer_cents: 1000,
    buffer_percent: null,
    liquidation_order_json: [],
    bridge_enabled_bool: false,
  }, { onConflict: 'user_id' });

  const liquidation = new LiquidationEngine();
  await liquidation.enqueueIfNeeded(userId);
  await liquidation.enqueueIfNeeded(userId);

  const jobs = await unwrap(
    supabaseAdmin.from('liquidation_jobs').select('id').eq('user_id', userId)
  );
  assert.equal(jobs.length, 1);

  const entriesBefore = await unwrap(
    supabaseAdmin.from('ledger_journal_entries').select('id').eq('user_id', userId)
  );

  const reconcile = new ReconciliationService();
  await reconcile.reconcileUser(userId);
  await reconcile.reconcileUser(userId);

  const entriesAfter = await unwrap(
    supabaseAdmin.from('ledger_journal_entries').select('id').eq('user_id', userId)
  );

  assert.equal(entriesAfter.length, entriesBefore.length);
});

test('alpaca partial fill uses actual filled amounts', async () => {
  const symbol = 'SPY';
  const { data: existing } = await supabaseAdmin
    .from('instruments')
    .select('id, symbol')
    .eq('symbol', symbol)
    .maybeSingle();

  const instrument = existing || (await unwrap(
    supabaseAdmin
      .from('instruments')
      .insert({ symbol, type: 'ETF', quote_source: 'alpaca' })
      .select('id, symbol')
      .single()
  ));

  const externalOrderId = `alpaca-${randomUUID()}`;
  const order = await unwrap(
    supabaseAdmin
      .from('orders')
      .insert({
        user_id: userId,
        instrument_id: instrument.id,
        side: 'buy',
        notional_cents: 10000,
        status: 'placed',
        external_order_id: externalOrderId,
      })
      .select('*')
      .single()
  );

  const adapter = Object.create(AlpacaBrokerageAdapter.prototype) as any;
  adapter.config = { key: 'x', secret: 'y', baseUrl: 'http://local', dataUrl: 'http://local' };
  adapter.local = new PaperBrokerageAdapter();
  adapter.eventStore = new EventStore();
  adapter.receipts = new ReceiptBuilder();
  adapter.request = async () => ({
    ok: true,
    status: 200,
    data: {
      status: 'filled',
      filled_qty: '0.5',
      filled_avg_price: '100',
      qty: '1',
      notional: '100',
    },
  });

  await adapter.fillOrder(order);

  const entries = await unwrap(
    supabaseAdmin
      .from('ledger_journal_entries')
      .select('id')
      .eq('external_id', externalOrderId)
  );
  assert.equal(entries.length, 1);

  const postings = await unwrap(
    supabaseAdmin
      .from('ledger_postings')
      .select('amount_cents')
      .eq('journal_entry_id', entries[0].id)
  );
  const amounts = postings.map((row) => Number(row.amount_cents));
  assert.ok(amounts.every((value) => value === 5000));
});

test('alpaca missing fill fields do not overstate', async () => {
  const symbol = 'SPY';
  const { data: existing } = await supabaseAdmin
    .from('instruments')
    .select('id, symbol')
    .eq('symbol', symbol)
    .maybeSingle();

  const instrument = existing || (await unwrap(
    supabaseAdmin
      .from('instruments')
      .insert({ symbol, type: 'ETF', quote_source: 'alpaca' })
      .select('id, symbol')
      .single()
  ));

  const externalOrderId = `alpaca-missing-${randomUUID()}`;
  const order = await unwrap(
    supabaseAdmin
      .from('orders')
      .insert({
        user_id: userId,
        instrument_id: instrument.id,
        side: 'buy',
        notional_cents: 10000,
        status: 'placed',
        external_order_id: externalOrderId,
      })
      .select('*')
      .single()
  );

  const adapter = Object.create(AlpacaBrokerageAdapter.prototype) as any;
  adapter.config = { key: 'x', secret: 'y', baseUrl: 'http://local', dataUrl: 'http://local' };
  adapter.local = new PaperBrokerageAdapter();
  adapter.eventStore = new EventStore();
  adapter.receipts = new ReceiptBuilder();
  adapter.request = async () => ({
    ok: true,
    status: 200,
    data: { status: 'filled' },
  });

  await adapter.fillOrder(order);

  const entries = await unwrap(
    supabaseAdmin
      .from('ledger_journal_entries')
      .select('id')
      .eq('external_id', externalOrderId)
  );
  assert.equal(entries.length, 0);

  const updatedOrder = await unwrap(
    supabaseAdmin
      .from('orders')
      .select('status')
      .eq('id', order.id)
      .single()
  );
  assert.equal(updatedOrder.status, 'pending_fill_accounting');
});

test('pending fill alert is idempotent', async () => {
  const symbol = 'SPY';
  const { data: existing } = await supabaseAdmin
    .from('instruments')
    .select('id, symbol')
    .eq('symbol', symbol)
    .maybeSingle();

  const instrument = existing || (await unwrap(
    supabaseAdmin
      .from('instruments')
      .insert({ symbol, type: 'ETF', quote_source: 'alpaca' })
      .select('id, symbol')
      .single()
  ));

  const externalOrderId = `alpaca-alert-${randomUUID()}`;
  const order = await unwrap(
    supabaseAdmin
      .from('orders')
      .insert({
        user_id: userId,
        instrument_id: instrument.id,
        side: 'buy',
        notional_cents: 10000,
        status: 'placed',
        external_order_id: externalOrderId,
      })
      .select('*')
      .single()
  );

  const adapter = Object.create(AlpacaBrokerageAdapter.prototype) as any;
  adapter.config = { key: 'x', secret: 'y', baseUrl: 'http://local', dataUrl: 'http://local' };
  adapter.local = new PaperBrokerageAdapter();
  adapter.eventStore = new EventStore();
  adapter.receipts = new ReceiptBuilder();
  adapter.request = async () => ({
    ok: true,
    status: 200,
    data: { status: 'filled' },
  });

  await adapter.fillOrder(order);
  await adapter.fillOrder(order);

  const alerts = await unwrap(
    supabaseAdmin
      .from('internal_alerts')
      .select('id')
      .eq('kind', 'pending_fill_accounting')
      .contains('metadata', { external_order_id: externalOrderId })
  );
  assert.equal(alerts.length, 1);
});
