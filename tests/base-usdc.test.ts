import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { after, before, beforeEach, test } from 'node:test';
import { supabaseAdmin } from '../lib/server/supabaseAdmin';
import { BaseUsdcExecutionService } from '../lib/engine/baseUsdc/execution';
import { BaseUsdcSpendPowerEngine } from '../lib/engine/baseUsdc/spendPower';
import { BaseUsdcKernel } from '../lib/engine/baseUsdcKernel';
import { buildUnsignedTransfer } from '../lib/engine/baseUsdc/tx';
import { DEFAULT_USDC_BASE_ADDRESS } from '../providers/base_usdc/constants';

const TEST_PASSWORD = 'testpass123';

async function ensureTestUser(): Promise<string> {
  const email = `base-usdc-test-${randomUUID()}@bloom.local`;
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
    'wallets',
    'user_flags',
    'agent_tokens',
    'quotes',
    'executions',
    'reserves',
    'receipts',
    'rpc_health',
    'onchain_transfers',
    'onchain_cursor',
    'spend_power_snapshots',
    'normalized_events',
  ];

  for (const table of tables) {
    const query = supabaseAdmin.from(table).delete();
    if (table === 'onchain_cursor' || table === 'onchain_transfers') {
      const { error } = await query.neq('chain_id', '');
      if (error) throw error;
      continue;
    }
    if (table === 'rpc_health') {
      const { error } = await query.neq('provider_name', '');
      if (error) throw error;
      continue;
    }
    const { error } = await query.eq('user_id', userId);
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

function createMockSpendPower(status: 'fresh' | 'stale' | 'unknown', spendPowerCents = 10000) {
  return {
    calculateSpendPower: async () => ({
      confirmed_balance_cents: spendPowerCents,
      active_reserves_cents: 0,
      safety_buffer_cents: 0,
      degradation_buffer_cents: 0,
      spend_power_cents: spendPowerCents,
      freshness_status: status,
      updated_ago_seconds: 1,
      receipts_preview: [],
    }),
  } as unknown as BaseUsdcSpendPowerEngine;
}

function createMockSigner() {
  return {
    getAddress: async () => null,
    signAndSendTx: async () => ({ tx_hash: '0xmockhash' }),
  } as any;
}

type RlpInput = Uint8Array | RlpInput[];

function hexToBytes(hex: string): Uint8Array {
  const stripped = hex.startsWith('0x') ? hex.slice(2) : hex;
  const normalized = stripped.length % 2 === 0 ? stripped : `0${stripped}`;
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return `0x${Buffer.from(bytes).toString('hex')}`;
}

function concatBytes(chunks: Uint8Array[]) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function encodeLength(length: number, offset: number) {
  if (length < 56) {
    return new Uint8Array([length + offset]);
  }
  const hex = length.toString(16);
  const lengthBytes = hexToBytes(`0x${hex}`);
  return concatBytes([new Uint8Array([offset + 55 + lengthBytes.length]), lengthBytes]);
}

function rlpEncode(input: RlpInput): Uint8Array {
  if (Array.isArray(input)) {
    const encodedItems = input.map((item) => rlpEncode(item));
    const payload = concatBytes(encodedItems);
    return concatBytes([encodeLength(payload.length, 0xc0), payload]);
  }

  if (input.length === 1 && input[0] < 0x80) {
    return input;
  }

  return concatBytes([encodeLength(input.length, 0x80), input]);
}

function encodeNumber(value: bigint) {
  if (value === 0n) return new Uint8Array([]);
  const hex = value.toString(16);
  return hexToBytes(`0x${hex}`);
}

function buildFakeSignedTx(unsignedTx: { to: string; data: string; chain_id: number }) {
  const fields: RlpInput[] = [
    encodeNumber(BigInt(unsignedTx.chain_id)),
    encodeNumber(0n),
    encodeNumber(0n),
    encodeNumber(0n),
    encodeNumber(21000n),
    hexToBytes(unsignedTx.to),
    encodeNumber(0n),
    hexToBytes(unsignedTx.data),
    [],
    encodeNumber(0n),
    encodeNumber(1n),
    encodeNumber(1n),
  ];

  const encoded = rlpEncode(fields);
  return `0x02${bytesToHex(encoded).slice(2)}`;
}

test('can_act is idempotent for quotes', async () => {
  const walletAddress = '0x1111111111111111111111111111111111111111';
  await supabaseAdmin.from('wallets').insert({
    user_id: userId,
    address: walletAddress,
    custody_type: 'external',
  });

  const agentId = `agent-${randomUUID()}`;
  await supabaseAdmin.from('agent_tokens').insert({
    agent_id: agentId,
    user_id: userId,
    scopes_json: { per_tx_limit_cents: 20000 },
    status: 'active',
  });

  const engine = new BaseUsdcExecutionService(createMockSpendPower('fresh'), createMockSigner());
  const intent = { type: 'send_usdc', to: walletAddress, amount_cents: 1000 };

  const first = await engine.canAct({
    user_id: userId,
    agent_id: agentId,
    intent,
    idempotency_key: 'quote-key-1',
  });

  const second = await engine.canAct({
    user_id: userId,
    agent_id: agentId,
    intent,
    idempotency_key: 'quote-key-1',
  });

  assert.ok(first.quote_id);
  assert.equal(first.quote_id, second.quote_id);
});

test('execute returns existing execution for idempotency', async () => {
  const agentId = `agent-${randomUUID()}`;
  const intent = { type: 'send_usdc', to: '0x2222222222222222222222222222222222222222', amount_cents: 1200 };

  await supabaseAdmin.from('agent_tokens').insert({
    agent_id: agentId,
    user_id: userId,
    scopes_json: { per_tx_limit_cents: 20000 },
    status: 'active',
  });

  const { data: quote } = await supabaseAdmin
    .from('quotes')
    .insert({
      user_id: userId,
      agent_id: agentId,
      intent_json: intent,
      allowed: true,
      requires_step_up: false,
      reason: 'Allowed',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      idempotency_key: 'quote-key-2',
      created_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  const { data: execution } = await supabaseAdmin
    .from('executions')
    .insert({
      quote_id: quote.quote_id,
      user_id: userId,
      agent_id: agentId,
      status: 'broadcast',
      amount_cents: intent.amount_cents,
      idempotency_key: 'exec-key-1',
      tx_hash: '0xexisting',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  const engine = new BaseUsdcExecutionService(createMockSpendPower('fresh'), createMockSigner());
  const result = await engine.execute({
    quote_id: quote.quote_id,
    idempotency_key: 'exec-key-1',
    signed_payload: '0xdeadbeef',
  });

  assert.equal(result.exec_id, execution.exec_id);
  assert.equal(result.tx_hash, execution.tx_hash);
});

test('spend power uses balanceOf minus reserves (not transfer sums)', async () => {
  const walletAddress = '0x3333333333333333333333333333333333333333';
  await supabaseAdmin.from('wallets').insert({
    user_id: userId,
    address: walletAddress,
    custody_type: 'external',
  });

  await supabaseAdmin.from('reserves').insert({
    user_id: userId,
    amount_cents: 2500,
    reason: 'EXECUTE_SEND_USDC',
    status: 'active',
    external_ref: 'quote-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  await supabaseAdmin.from('onchain_transfers').insert({
    chain_id: 'base',
    block_number: 1,
    tx_hash: '0xtransfer',
    log_index: 0,
    from_address: walletAddress,
    to_address: walletAddress,
    amount_cents: 9999,
    token_address: DEFAULT_USDC_BASE_ADDRESS,
    occurred_at: new Date().toISOString(),
    confirmed: true,
    confirmations: 12,
    created_at: new Date().toISOString(),
  });

  const mockRpc = {
    getHead: async () => ({ blockNumber: 100, blockTime: new Date().toISOString(), blockTimestamp: Math.floor(Date.now() / 1000) }),
    getBalanceOfUSDC: async () => 100_000_000n,
  } as any;

  process.env.SAFETY_BUFFER_BPS = '0';
  process.env.BUFFER_FLOOR_CENTS = '0';
  process.env.DEGRADATION_BUFFER_BPS = '0';

  const engine = new BaseUsdcSpendPowerEngine(mockRpc);
  const result = await engine.calculateSpendPower(userId);

  assert.equal(result.confirmed_balance_cents, 10000);
  assert.equal(result.spend_power_cents, 7500);
});

test('execute blocks on stale freshness without override', async () => {
  const agentId = `agent-${randomUUID()}`;
  const intent = { type: 'send_usdc', to: '0x4444444444444444444444444444444444444444', amount_cents: 1500 };

  await supabaseAdmin.from('agent_tokens').insert({
    agent_id: agentId,
    user_id: userId,
    scopes_json: { per_tx_limit_cents: 20000 },
    status: 'active',
  });

  const { data: quote } = await supabaseAdmin
    .from('quotes')
    .insert({
      user_id: userId,
      agent_id: agentId,
      intent_json: intent,
      allowed: true,
      requires_step_up: false,
      reason: 'Allowed',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      idempotency_key: 'quote-key-3',
      created_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  const engine = new BaseUsdcExecutionService(createMockSpendPower('stale'), createMockSigner());
  delete process.env.ALLOW_DEGRADED_EXECUTION;

  const result = await engine.execute({
    quote_id: quote.quote_id,
    idempotency_key: 'exec-key-2',
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.failure_reason, 'RPC health stale');
});

test('execute with degraded override emits policy receipt', async () => {
  const agentId = `agent-${randomUUID()}`;
  const intent = { type: 'send_usdc', to: '0x5555555555555555555555555555555555555555', amount_cents: 1200 };

  await supabaseAdmin.from('wallets').insert({
    user_id: userId,
    address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    custody_type: 'external',
  });

  await supabaseAdmin.from('agent_tokens').insert({
    agent_id: agentId,
    user_id: userId,
    scopes_json: { per_tx_limit_cents: 20000 },
    status: 'active',
  });

  const { data: quote } = await supabaseAdmin
    .from('quotes')
    .insert({
      user_id: userId,
      agent_id: agentId,
      intent_json: intent,
      allowed: true,
      requires_step_up: false,
      reason: 'Allowed',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      idempotency_key: 'quote-key-4',
      created_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  process.env.ALLOW_DEGRADED_EXECUTION = 'true';

  const unsignedTx = buildUnsignedTransfer(intent);
  const signedPayload = buildFakeSignedTx(unsignedTx);

  const engine = new BaseUsdcExecutionService(createMockSpendPower('stale'), createMockSigner());
  const result = await engine.execute({
    quote_id: quote.quote_id,
    idempotency_key: 'exec-key-3',
    signed_payload: signedPayload,
  });

  assert.equal(result.status, 'broadcast');

  const { data: receipts } = await supabaseAdmin
    .from('receipts')
    .select('id')
    .eq('user_id', userId)
    .eq('source', 'policy')
    .eq('type', 'degraded_override');

  assert.ok(receipts && receipts.length > 0);

  delete process.env.ALLOW_DEGRADED_EXECUTION;
});

test('policy enforcement checks per-tx, daily, and allowlist', async () => {
  const agentId = `agent-${randomUUID()}`;
  const allowedTo = '0x6666666666666666666666666666666666666666';

  await supabaseAdmin.from('wallets').insert({
    user_id: userId,
    address: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    custody_type: 'external',
  });

  await supabaseAdmin.from('agent_tokens').insert({
    agent_id: agentId,
    user_id: userId,
    scopes_json: {
      per_tx_limit_cents: 5000,
      daily_limit_cents: 10000,
      allowlist: [allowedTo],
    },
    status: 'active',
  });

  const engine = new BaseUsdcExecutionService(createMockSpendPower('fresh'), createMockSigner());

  const blocked = await engine.canAct({
    user_id: userId,
    agent_id: agentId,
    intent: { type: 'send_usdc', to: '0x7777777777777777777777777777777777777777', amount_cents: 1000 },
    idempotency_key: 'policy-key-1',
  });
  assert.equal(blocked.allowed, false);

  await supabaseAdmin.from('executions').insert({
    quote_id: null,
    user_id: userId,
    agent_id: agentId,
    status: 'confirmed',
    amount_cents: 9000,
    idempotency_key: 'exec-daily-1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const daily = await engine.canAct({
    user_id: userId,
    agent_id: agentId,
    intent: { type: 'send_usdc', to: allowedTo, amount_cents: 2000 },
    idempotency_key: 'policy-key-2',
  });
  assert.equal(daily.allowed, false);
});

test('kernel releases reserves on confirmation', async () => {
  const agentId = `agent-${randomUUID()}`;
  const intent = { type: 'send_usdc', to: '0x8888888888888888888888888888888888888888', amount_cents: 1000 };

  const { data: quote } = await supabaseAdmin
    .from('quotes')
    .insert({
      user_id: userId,
      agent_id: agentId,
      intent_json: intent,
      allowed: true,
      requires_step_up: false,
      reason: 'Allowed',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      idempotency_key: 'quote-key-5',
      created_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  const { data: execution } = await supabaseAdmin
    .from('executions')
    .insert({
      quote_id: quote.quote_id,
      user_id: userId,
      agent_id: agentId,
      status: 'broadcast',
      amount_cents: intent.amount_cents,
      idempotency_key: 'exec-key-4',
      tx_hash: '0xhash',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  await supabaseAdmin.from('reserves').insert({
    user_id: userId,
    amount_cents: intent.amount_cents,
    reason: 'EXECUTE_SEND_USDC',
    status: 'active',
    external_ref: quote.quote_id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const kernel = new BaseUsdcKernel();
  await kernel.processNormalizedEvent({
    id: randomUUID(),
    source: 'base_usdc',
    event_type: 'TX_CONFIRMED',
    external_id: execution.exec_id,
    user_id: userId,
    status: 'success',
    amount_cents: intent.amount_cents,
    occurred_at: new Date().toISOString(),
    metadata: { tx_hash: '0xhash', confirmations: 12, block_number: 10 },
  });

  const { data: reserves } = await supabaseAdmin
    .from('reserves')
    .select('status')
    .eq('user_id', userId)
    .eq('external_ref', quote.quote_id);

  assert.equal(reserves?.[0]?.status, 'released');
});
