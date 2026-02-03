import 'dotenv/config';
import { createHmac, randomUUID } from 'crypto';

const baseUrl = (process.env.BLOOM_API_BASE_URL || process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const accountId = process.env.UNIT_ACCOUNT_ID;
const secret = process.env.UNIT_WEBHOOK_SECRET || '';

if (!accountId) {
  console.error('Missing UNIT_ACCOUNT_ID. Set UNIT_ACCOUNT_ID before running this script.');
  process.exit(1);
}

function sign(body: string) {
  if (!secret) return undefined;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return { signature, timestamp };
}

async function post(payload: unknown) {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };

  const signed = sign(body);
  if (signed) {
    headers['unit-signature'] = `t=${signed.timestamp},v1=${signed.signature}`;
  }

  const res = await fetch(`${baseUrl}/api/unit/webhook`, {
    method: 'POST',
    headers,
    body,
  });

  const text = await res.text();
  console.log(`/api/unit/webhook -> ${res.status} ${text}`);
}

async function run() {
  const now = new Date().toISOString();
  const authId = `auth-${randomUUID()}`;
  const txnId = `txn-${randomUUID()}`;

  const payload = {
    data: [
      {
        id: `evt-${randomUUID()}`,
        type: 'authorization.created',
        attributes: { occurredAt: now },
        relationships: {
          authorization: { data: { type: 'authorization', id: authId } },
          account: { data: { type: 'account', id: accountId } },
        },
      },
      {
        id: `evt-${randomUUID()}`,
        type: 'transaction.created',
        attributes: { occurredAt: now },
        relationships: {
          transaction: { data: { type: 'transaction', id: txnId } },
          authorization: { data: { type: 'authorization', id: authId } },
          account: { data: { type: 'account', id: accountId } },
        },
      },
    ],
    included: [
      {
        type: 'authorization',
        id: authId,
        attributes: {
          amount: 1200,
          currency: 'USD',
          merchant: { name: 'Blue Bottle', mcc: '5814' },
          createdAt: now,
        },
      },
      {
        type: 'transaction',
        id: txnId,
        attributes: {
          amount: 1200,
          currency: 'USD',
          direction: 'debit',
          createdAt: now,
        },
      },
    ],
  };

  await post(payload);
}

run().catch((error) => {
  console.error('Unit webhook simulation failed:', error);
  process.exit(1);
});
