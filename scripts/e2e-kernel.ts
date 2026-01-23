import 'dotenv/config';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../lib/server/supabaseAdmin';
import { ColumnAdapter } from '../lib/engine/integrations/column';
import { CardService } from '../lib/engine/card';
import { BrokerageAdapter } from '../lib/engine/integrations/brokerage';
import { CryptoAdapter } from '../lib/engine/integrations/crypto';
import { SpendableEngine } from '../lib/engine/spendable';
import { LiquidationEngine } from '../lib/engine/liquidation';
import { ReconciliationService } from '../lib/engine/reconcile';

const DEFAULT_EMAIL = 'e2e@bloom.local';
const DEFAULT_PASSWORD = 'e2e-pass-123';

async function ensureUser() {
  const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
  const existingUser = listData?.users?.find((u) => u.email === DEFAULT_EMAIL);
  if (existingUser) return existingUser.id;

  const created = await supabaseAdmin.auth.admin.createUser({
    email: DEFAULT_EMAIL,
    password: DEFAULT_PASSWORD,
    email_confirm: true,
  });

  if (created.error || !created.data?.user) {
    throw created.error || new Error('Unable to create user');
  }

  return created.data.user.id;
}

async function assertTablesExist() {
  const { error } = await supabaseAdmin
    .from('ledger_accounts')
    .select('id')
    .limit(1);

  if (error) {
    throw new Error('Migrations missing. Run `npx supabase db push` first.');
  }
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
    await supabaseAdmin.from(table).delete().eq('user_id', userId);
  }
}

async function run() {
  await assertTablesExist();
  const userId = await ensureUser();
  await clearUserData(userId);

  await supabaseAdmin.from('policy').upsert({
    user_id: userId,
    buffer_cents: 2500,
    balance_mode: 'debit',
    bridge_enabled_bool: false,
  }, { onConflict: 'user_id' });

  const column = new ColumnAdapter();
  const card = new CardService();
  const brokerage = new BrokerageAdapter();
  const crypto = new CryptoAdapter();
  const spendable = new SpendableEngine();

  await column.handleAchEvent({
    external_id: `ach-${randomUUID()}`,
    user_id: userId,
    amount_cents: 100000,
    direction: 'credit',
    status: 'posted',
  });

  const equityOrder = await brokerage.placeOrder({
    user_id: userId,
    symbol: 'SPY',
    side: 'buy',
    notional_cents: 20000,
    idempotency_key: `order-${randomUUID()}`,
  });
  await brokerage.fillOrder(equityOrder);

  const btcOrder = await crypto.placeOrder({
    user_id: userId,
    symbol: 'BTC',
    side: 'buy',
    notional_cents: 15000,
    idempotency_key: `order-${randomUUID()}`,
  });
  await crypto.fillOrder(btcOrder);

  const authId = `auth-${randomUUID()}`;
  await card.handleAuthRequest({
    external_id: authId,
    user_id: userId,
    merchant_name: 'Blue Bottle',
    amount_cents: 1200,
  }, { source: 'e2e' });

  await card.handleSettlement({
    external_id: `txn-${randomUUID()}`,
    user_id: userId,
    merchant_name: 'Blue Bottle',
    amount_cents: 1200,
    auth_id: authId,
  }, { source: 'e2e' });

  await card.handleRefund({
    external_id: `refund-${randomUUID()}`,
    user_id: userId,
    merchant_name: 'Blue Bottle',
    amount_cents: 600,
    auth_id: authId,
  }, { source: 'e2e' });

  const liquidation = new LiquidationEngine();
  await liquidation.enqueueIfNeeded(userId);
  await liquidation.processQueued(3);

  const reconcile = new ReconciliationService();
  await reconcile.reconcileUser(userId);

  const spendableResult = await spendable.computeSpendableNow(userId);
  if (spendableResult.spendable_cents < 0) {
    throw new Error('Spendable is negative');
  }

  const receipts = await supabaseAdmin
    .from('receipts')
    .select('id')
    .eq('user_id', userId);
  if (!receipts.data || receipts.data.length < 3) {
    throw new Error('Receipts missing');
  }

  await card.handleAuthRequest({
    external_id: authId,
    user_id: userId,
    merchant_name: 'Blue Bottle',
    amount_cents: 1200,
  }, { source: 'e2e' });

  const receiptsAfterReplay = await supabaseAdmin
    .from('receipts')
    .select('id')
    .eq('user_id', userId)
    .contains('metadata_json', { external_id: authId });

  if (!receiptsAfterReplay.data || receiptsAfterReplay.data.length !== 1) {
    throw new Error('Idempotency failed for auth receipts');
  }

  console.log('E2E kernel ok.');
  console.log({
    spendable_cents: spendableResult.spendable_cents,
    cash_balance_cents: spendableResult.cash_balance_cents,
    active_holds_cents: spendableResult.active_holds_cents,
  });
}

run().catch((error) => {
  console.error('E2E kernel failed:', error);
  process.exit(1);
});
