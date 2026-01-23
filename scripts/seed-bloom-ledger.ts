import 'dotenv/config';
import { randomUUID } from 'crypto';
import { supabaseAdmin } from '../lib/server/supabaseAdmin';
import { ColumnAdapter } from '../lib/engine/integrations/column';
import { BrokerageAdapter } from '../lib/engine/integrations/brokerage';
import { CryptoAdapter } from '../lib/engine/integrations/crypto';
import { SpendableEngine } from '../lib/engine/spendable';

const DEFAULT_EMAIL = 'dev@bloom.local';
const DEFAULT_PASSWORD = 'devpass123';

async function ensureDevUser(): Promise<string> {
  if (process.env.DEV_USER_ID) {
    return process.env.DEV_USER_ID;
  }

  const email = process.env.DEV_USER_EMAIL || DEFAULT_EMAIL;
  const password = process.env.DEV_USER_PASSWORD || DEFAULT_PASSWORD;

  // Search for existing user by email using listUsers
  const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
  const existingUser = listData?.users?.find((u) => u.email === email);
  if (existingUser) {
    return existingUser.id;
  }

  const created = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (created.error || !created.data?.user) {
    throw created.error || new Error('Unable to create dev user');
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

async function seed() {
  const userId = await ensureDevUser();
  await clearUserData(userId);

  await supabaseAdmin.from('policy').upsert({
    user_id: userId,
    buffer_cents: 3000,
    buffer_percent: null,
    balance_mode: 'debit',
    liquidation_order_json: ['cash', 'stocks', 'btc'],
    bridge_enabled_bool: false,
  }, { onConflict: 'user_id' });

  const column = new ColumnAdapter();
  const brokerage = new BrokerageAdapter();
  const crypto = new CryptoAdapter();

  await column.handleAchEvent({
    external_id: `ach-${randomUUID()}`,
    user_id: userId,
    amount_cents: 145000,
    direction: 'credit',
  });

  const authId = `auth-${randomUUID()}`;
  await column.handleAuthRequest({
    external_id: authId,
    user_id: userId,
    merchant_name: 'Apple',
    mcc: '5816',
    amount_cents: 10000,
  });

  await column.handleTransactionPosted({
    external_id: `txn-${randomUUID()}`,
    user_id: userId,
    merchant_name: 'Apple',
    amount_cents: 10000,
    auth_id: authId,
  });

  await column.handleAuthRequest({
    external_id: `auth-${randomUUID()}`,
    user_id: userId,
    merchant_name: 'Spotify',
    mcc: '5817',
    amount_cents: 5800,
  });

  const spyOrder = await brokerage.placeOrder({
    user_id: userId,
    symbol: 'SPY',
    side: 'buy',
    notional_cents: 45000,
    idempotency_key: `order-${randomUUID()}`,
  });
  await brokerage.fillOrder(spyOrder);

  const btcOrder = await crypto.placeOrder({
    user_id: userId,
    symbol: 'BTC',
    side: 'buy',
    notional_cents: 30000,
    idempotency_key: `order-${randomUUID()}`,
  });
  await crypto.fillOrder(btcOrder);

  const spendable = await new SpendableEngine().computeSpendableNow(userId);

  console.log('Seed complete.');
  console.log(`DEV_USER_ID=${userId}`);
  console.log(`Spendable: $${(spendable.spendable_cents / 100).toFixed(2)}`);
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
