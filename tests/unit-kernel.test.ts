import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import type { Server } from 'http';
import { after, before, beforeEach, test } from 'node:test';
import { supabaseAdmin } from '../lib/server/supabaseAdmin';
import { SpendPowerKernel } from '../lib/engine/spendPowerKernel';
import { SpendPowerEngine } from '../lib/engine/spendPower';
import { normalizeUnitEvent } from '../providers/unit';
import { createApiServer } from '../dev/api-only';

const TEST_PASSWORD = 'testpass123';
const UNIT_SECRET = 'unit-test-secret';
const ORIGINAL_UNIT_SECRET = process.env.UNIT_WEBHOOK_SECRET;
let apiServer: Server | null = null;
let apiBaseUrl = '';

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
const fixturesDir = path.join(process.cwd(), 'fixtures', 'unit');

before(async () => {
  process.env.UNIT_WEBHOOK_SECRET = UNIT_SECRET;
  const app = createApiServer();
  apiServer = app.listen(0);
  const address = apiServer.address();
  const port = typeof address === 'object' && address ? address.port : 3000;
  apiBaseUrl = `http://127.0.0.1:${port}`;
  userId = await ensureTestUser();
});

after(async () => {
  if (!userId) return;
  await clearUserData(userId);
  await supabaseAdmin.auth.admin.deleteUser(userId);
  if (apiServer) {
    await new Promise<void>((resolve, reject) => {
      apiServer?.close((err) => (err ? reject(err) : resolve()));
    });
  }
  if (ORIGINAL_UNIT_SECRET !== undefined) {
    process.env.UNIT_WEBHOOK_SECRET = ORIGINAL_UNIT_SECRET;
  } else if (process.env.UNIT_WEBHOOK_SECRET === UNIT_SECRET) {
    delete process.env.UNIT_WEBHOOK_SECRET;
  }
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

function loadFixture(name: string): any {
  const raw = readFileSync(path.join(fixturesDir, name), 'utf8');
  return JSON.parse(raw);
}

function applyAuthorizationFixture(
  envelope: any,
  options: { eventId: string; authId: string; occurredAt: string; amountCents: number; type: string; reason?: string }
) {
  envelope.data.id = options.eventId;
  envelope.data.type = options.type;
  envelope.data.attributes = envelope.data.attributes || {};
  envelope.data.attributes.occurredAt = options.occurredAt;
  if (options.reason) {
    envelope.data.attributes.reason = options.reason;
  }
  envelope.data.relationships.authorization.data.id = options.authId;
  envelope.data.relationships.account.data.id = accountId;
  envelope.included[0].id = options.authId;
  envelope.included[0].attributes.amount = options.amountCents;
  envelope.included[0].attributes.createdAt = options.occurredAt;
  return envelope;
}

function applyTransactionFixture(
  envelope: any,
  options: { eventId: string; txnId: string; authId: string; occurredAt: string; amountCents: number }
) {
  envelope.data.id = options.eventId;
  envelope.data.attributes = envelope.data.attributes || {};
  envelope.data.attributes.occurredAt = options.occurredAt;
  envelope.data.relationships.transaction.data.id = options.txnId;
  envelope.data.relationships.authorization.data.id = options.authId;
  envelope.data.relationships.account.data.id = accountId;
  envelope.included[0].id = options.txnId;
  envelope.included[0].attributes.amount = options.amountCents;
  envelope.included[0].attributes.createdAt = options.occurredAt;
  return envelope;
}

function signBody(body: string, secret: string) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

async function postUnitWebhook(payload: unknown) {
  const body = JSON.stringify(payload);
  const signature = signBody(body, UNIT_SECRET);
  return fetch(`${apiBaseUrl}/api/unit/webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'unit-signature': signature,
    },
    body,
  });
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

test('webhook fixtures are idempotent', async () => {
  const authId = `auth-${randomUUID()}`;
  const eventId = `evt-${randomUUID()}`;
  const now = new Date().toISOString();
  const envelope = applyAuthorizationFixture(loadFixture('authorization.created.json'), {
    eventId,
    authId,
    occurredAt: now,
    amountCents: 1500,
    type: 'authorization.created',
  });

  const first = await postUnitWebhook(envelope);
  assert.equal(first.status, 200);
  const second = await postUnitWebhook(envelope);
  assert.equal(second.status, 200);

  const { data: rawEvents, error: rawEventsError } = await supabaseAdmin
    .from('raw_events')
    .select('id')
    .eq('provider', 'unit')
    .eq('provider_event_id', eventId);
  if (rawEventsError) throw rawEventsError;
  assert.equal(rawEvents?.length, 1);

  const { data: receipts, error: receiptsError } = await supabaseAdmin
    .from('receipts')
    .select('id')
    .eq('user_id', userId)
    .eq('source', 'unit_event')
    .eq('provider_event_id', eventId);
  if (receiptsError) throw receiptsError;
  assert.equal(receipts?.length, 1);
});

test('webhook tolerates out-of-order cancel', async () => {
  const authId = `auth-${randomUUID()}`;
  const createdAt = new Date().toISOString();
  const canceledAt = new Date(Date.now() + 60_000).toISOString();

  const cancelEnvelope = applyAuthorizationFixture(loadFixture('authorization.canceled.json'), {
    eventId: `evt-${randomUUID()}`,
    authId,
    occurredAt: canceledAt,
    amountCents: 2000,
    type: 'authorization.canceled',
    reason: 'merchant_canceled',
  });
  const createEnvelope = applyAuthorizationFixture(loadFixture('authorization.created.json'), {
    eventId: `evt-${randomUUID()}`,
    authId,
    occurredAt: createdAt,
    amountCents: 2000,
    type: 'authorization.created',
  });

  const cancelRes = await postUnitWebhook(cancelEnvelope);
  assert.equal(cancelRes.status, 200);
  const createRes = await postUnitWebhook(createEnvelope);
  assert.equal(createRes.status, 200);

  const { data: hold, error: holdError } = await supabaseAdmin
    .from('auth_holds')
    .select('status')
    .eq('hold_id', authId)
    .single();
  if (holdError) throw holdError;
  assert.equal(hold.status, 'canceled');
});

test('webhook transaction releases hold', async () => {
  const authId = `auth-${randomUUID()}`;
  const txnId = `txn-${randomUUID()}`;
  const createdAt = new Date().toISOString();
  const txnAt = new Date(Date.now() + 30_000).toISOString();

  const authEnvelope = applyAuthorizationFixture(loadFixture('authorization.created.json'), {
    eventId: `evt-${randomUUID()}`,
    authId,
    occurredAt: createdAt,
    amountCents: 1200,
    type: 'authorization.created',
  });
  const txnEnvelope = applyTransactionFixture(loadFixture('transaction.created.json'), {
    eventId: `evt-${randomUUID()}`,
    txnId,
    authId,
    occurredAt: txnAt,
    amountCents: 1200,
  });

  const authRes = await postUnitWebhook(authEnvelope);
  assert.equal(authRes.status, 200);
  const txnRes = await postUnitWebhook(txnEnvelope);
  assert.equal(txnRes.status, 200);

  const { data: hold, error: holdError } = await supabaseAdmin
    .from('auth_holds')
    .select('status')
    .eq('hold_id', authId)
    .single();
  if (holdError) throw holdError;
  assert.equal(hold.status, 'released');

  const { data: txn, error: txnError } = await supabaseAdmin
    .from('transactions')
    .select('transaction_id')
    .eq('transaction_id', txnId)
    .maybeSingle();
  if (txnError) throw txnError;
  assert.ok(txn?.transaction_id);
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
