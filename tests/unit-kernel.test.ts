import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { after, before, beforeEach, test } from 'node:test';
import { supabaseAdmin } from '../lib/server/supabaseAdmin';
import { SpendPowerKernel } from '../lib/engine/spendPowerKernel';
import { SpendPowerEngine } from '../lib/engine/spendPower';
import { normalizeUnitEvent } from '../providers/unit';

const TEST_PASSWORD = 'testpass123';

async function ensureTestUser(): Promise<string> {
  const email = `unit-test-${randomUUID()}@bloom.local`;
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
    'auth_holds',
    'transactions',
    'reserves',
    'issues',
    'spend_power_snapshots',
    'reconciliation_mismatches',
    'receipts',
    'external_links',
    'raw_events',
  ];

  for (const table of tables) {
    const { error } = await supabaseAdmin.from(table).delete().eq('user_id', userId);
    if (error) throw error;
  }
}

let userId = '';
const accountId = `unit-account-${randomUUID()}`;

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
  await supabaseAdmin
    .from('external_links')
    .insert({
      user_id: userId,
      provider: 'unit',
      bank_account_id: accountId,
      card_id: `card-${randomUUID()}`,
      metadata_json: {},
    });

  await supabaseAdmin
    .from('feed_health')
    .delete()
    .eq('feed_name', 'unit_webhook');
});

function buildAuthorizationEnvelope(eventId: string, authId: string, occurredAt: string, type: string, amountCents: number) {
  return {
    data: {
      id: eventId,
      type,
      attributes: { occurredAt },
      relationships: {
        authorization: { data: { type: 'authorization', id: authId } },
        account: { data: { type: 'account', id: accountId } },
      },
    },
    included: [
      {
        type: 'authorization',
        id: authId,
        attributes: {
          amount: amountCents,
          currency: 'USD',
          merchant: { name: 'Test Merchant', mcc: '5814' },
          createdAt: occurredAt,
        },
      },
    ],
  };
}

function buildTransactionEnvelope(eventId: string, txnId: string, authId: string, occurredAt: string, amountCents: number) {
  return {
    data: {
      id: eventId,
      type: 'transaction.created',
      attributes: { occurredAt },
      relationships: {
        transaction: { data: { type: 'transaction', id: txnId } },
        authorization: { data: { type: 'authorization', id: authId } },
        account: { data: { type: 'account', id: accountId } },
      },
    },
    included: [
      {
        type: 'transaction',
        id: txnId,
        attributes: {
          amount: amountCents,
          currency: 'USD',
          direction: 'debit',
          createdAt: occurredAt,
        },
      },
    ],
  };
}

async function insertRawEvent(event: { data: { id: string; type: string } }) {
  const { data, error } = await supabaseAdmin
    .from('raw_events')
    .insert({
      source: 'unit',
      provider: 'unit',
      event_type: event.data.type,
      type: event.data.type,
      external_id: event.data.id,
      provider_event_id: event.data.id,
      payload: event,
    })
    .select('*')
    .single();
  if (error || !data) throw error;
  return data;
}

test('unit events are idempotent', async () => {
  const kernel = new SpendPowerKernel();
  const eventId = `evt-${randomUUID()}`;
  const authId = `auth-${randomUUID()}`;
  const envelope = buildAuthorizationEnvelope(eventId, authId, new Date().toISOString(), 'authorization.created', 1500);
  const rawEvent = await insertRawEvent(envelope);

  const normalized = normalizeUnitEvent(envelope);
  assert.ok(normalized);

  await kernel.processEvent({ ...normalized, rawEventId: rawEvent.id });
  await kernel.processEvent({ ...normalized, rawEventId: rawEvent.id });

  const { data: holds } = await supabaseAdmin
    .from('auth_holds')
    .select('hold_id')
    .eq('hold_id', authId);
  assert.equal(holds?.length, 1);

  const { data: receipts } = await supabaseAdmin
    .from('receipts')
    .select('id')
    .eq('user_id', userId)
    .eq('source', 'unit_event')
    .eq('provider_event_id', eventId);
  assert.equal(receipts?.length, 1);
});

test('out-of-order authorization events converge', async () => {
  const kernel = new SpendPowerKernel();
  const authId = `auth-${randomUUID()}`;
  const createdAt = new Date().toISOString();
  const canceledAt = new Date(Date.now() + 60_000).toISOString();

  const cancelEvent = buildAuthorizationEnvelope(`evt-${randomUUID()}`, authId, canceledAt, 'authorization.canceled', 2000);
  const createEvent = buildAuthorizationEnvelope(`evt-${randomUUID()}`, authId, createdAt, 'authorization.created', 2000);

  const normalizedCancel = normalizeUnitEvent(cancelEvent);
  const normalizedCreate = normalizeUnitEvent(createEvent);
  assert.ok(normalizedCancel);
  assert.ok(normalizedCreate);

  await kernel.processEvent({ ...normalizedCancel, rawEventId: (await insertRawEvent(cancelEvent)).id });
  await kernel.processEvent({ ...normalizedCreate, rawEventId: (await insertRawEvent(createEvent)).id });

  const { data: hold } = await supabaseAdmin
    .from('auth_holds')
    .select('status')
    .eq('hold_id', authId)
    .single();

  assert.equal(hold.status, 'canceled');
});

test('partial capture leaves remaining hold active', async () => {
  const kernel = new SpendPowerKernel();
  const authId = `auth-${randomUUID()}`;
  const txnId = `txn-${randomUUID()}`;

  const t1 = new Date().toISOString();
  const t2 = new Date(Date.now() + 30_000).toISOString();
  const t3 = new Date(Date.now() + 60_000).toISOString();

  const createEnvelope = buildAuthorizationEnvelope(`evt-${randomUUID()}`, authId, t1, 'authorization.created', 1000);
  const txnEnvelope = buildTransactionEnvelope(`evt-${randomUUID()}`, txnId, authId, t2, 600);
  const changeEnvelope = buildAuthorizationEnvelope(`evt-${randomUUID()}`, authId, t3, 'authorization.amountChanged', 400);

  const normalizedCreate = normalizeUnitEvent(createEnvelope);
  const normalizedTxn = normalizeUnitEvent(txnEnvelope);
  const normalizedChange = normalizeUnitEvent(changeEnvelope);
  assert.ok(normalizedCreate);
  assert.ok(normalizedTxn);
  assert.ok(normalizedChange);

  await kernel.processEvent({ ...normalizedCreate, rawEventId: (await insertRawEvent(createEnvelope)).id });
  await kernel.processEvent({ ...normalizedTxn, rawEventId: (await insertRawEvent(txnEnvelope)).id });
  await kernel.processEvent({ ...normalizedChange, rawEventId: (await insertRawEvent(changeEnvelope)).id });

  const { data: hold } = await supabaseAdmin
    .from('auth_holds')
    .select('status, amount_cents')
    .eq('hold_id', authId)
    .single();

  assert.equal(hold.status, 'active');
  assert.equal(Number(hold.amount_cents), 400);
});

test('stale feed adds degradation buffer', async () => {
  const originalFresh = process.env.FRESH_MAX_SECONDS;
  const originalStale = process.env.STALE_MAX_SECONDS;
  const originalUnknown = process.env.UNKNOWN_MAX_SECONDS;
  const originalDegrade = process.env.SPEND_POWER_DEGRADATION_BUFFER_CENTS;

  process.env.FRESH_MAX_SECONDS = '60';
  process.env.STALE_MAX_SECONDS = '300';
  process.env.UNKNOWN_MAX_SECONDS = '900';
  process.env.SPEND_POWER_DEGRADATION_BUFFER_CENTS = '500';

  const staleAt = new Date(Date.now() - 120_000).toISOString();
  await supabaseAdmin
    .from('feed_health')
    .insert({
      feed_name: 'unit_webhook',
      last_event_received_at: staleAt,
      last_event_occurred_at: staleAt,
      status: 'fresh',
      updated_at: staleAt,
    });

  const engine = new SpendPowerEngine();
  const result = await engine.calculateSpendPower(userId);

  assert.equal(result.freshness_status, 'stale');
  assert.equal(result.degradation_buffer_cents, 500);

  process.env.FRESH_MAX_SECONDS = originalFresh;
  process.env.STALE_MAX_SECONDS = originalStale;
  process.env.UNKNOWN_MAX_SECONDS = originalUnknown;
  process.env.SPEND_POWER_DEGRADATION_BUFFER_CENTS = originalDegrade;
});
