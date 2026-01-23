import { createHmac, randomUUID } from 'crypto';

const baseUrl = (process.env.BLOOM_API_BASE_URL || process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const userId = process.env.DEV_USER_ID;
const secret = process.env.COLUMN_WEBHOOK_SECRET;

if (!userId) {
  console.error('Missing DEV_USER_ID. Set DEV_USER_ID before running this script.');
  process.exit(1);
}

function sign(body: string) {
  if (!secret) return undefined;
  return createHmac('sha256', secret).update(body).digest('hex');
}

async function post(path: string, payload: unknown) {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };

  const signature = sign(body);
  if (signature) {
    headers['x-column-signature'] = signature;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body,
  });

  const text = await res.text();
  console.log(`${path} -> ${res.status} ${text}`);
}

async function run() {
  const authId = `auth-${randomUUID()}`;
  await post('/api/webhooks/column/auth_request', {
    external_id: authId,
    user_id: userId,
    merchant_name: 'Blue Bottle',
    mcc: '5814',
    amount_cents: 1200,
  });

  await post('/api/webhooks/column/transaction_posted', {
    external_id: `txn-${randomUUID()}`,
    user_id: userId,
    merchant_name: 'Blue Bottle',
    amount_cents: 1200,
    auth_id: authId,
  });

  await post('/api/webhooks/column/ach_event', {
    external_id: `ach-${randomUUID()}`,
    user_id: userId,
    amount_cents: 25000,
    direction: 'credit',
  });
}

run().catch((error) => {
  console.error('Webhook simulation failed:', error);
  process.exit(1);
});
