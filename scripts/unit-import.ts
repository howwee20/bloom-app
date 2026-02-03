import 'dotenv/config';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { supabaseAdmin } from '../lib/server/supabaseAdmin';
import { ExternalLinkService } from '../lib/engine/externalLinks';
import { getUnitAccount, isUnitConfigured } from '../lib/engine/integrations/unitClient';

async function ensureDevUser(): Promise<string> {
  if (process.env.DEV_USER_ID) return process.env.DEV_USER_ID;

  const email = process.env.DEV_USER_EMAIL || 'dev@bloom.local';
  const password = process.env.DEV_USER_PASSWORD || 'devpass123';

  const existing = await supabaseAdmin.auth.admin.getUserByEmail(email);
  if (existing.data?.user) {
    return existing.data.user.id;
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

async function promptIfMissing(label: string, current?: string) {
  if (current) return current;
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question(`${label}: `);
  rl.close();
  if (!answer) {
    throw new Error(`${label} is required`);
  }
  return answer.trim();
}

async function run() {
  if (!isUnitConfigured()) {
    throw new Error('UNIT_API_KEY is not configured');
  }

  const userId = await ensureDevUser();

  const accountId = await promptIfMissing('UNIT_ACCOUNT_ID', process.env.UNIT_ACCOUNT_ID);
  const cardId = await promptIfMissing('UNIT_CARD_ID', process.env.UNIT_CARD_ID);

  const account = await getUnitAccount(accountId);
  if (!account.ok) {
    throw new Error(`Unit account lookup failed (${account.status})`);
  }

  const externalLinks = new ExternalLinkService();
  await externalLinks.upsertLink({
    user_id: userId,
    provider: 'unit',
    bank_account_id: accountId,
    card_id: cardId,
    metadata_json: {
      account_type: account.data?.data?.type ?? null,
    },
  });

  const webhookBase = process.env.BLOOM_WEBHOOK_BASE_URL || process.env.EXPO_PUBLIC_API_BASE_URL || 'https://your-domain';

  console.log('✅ Unit import complete');
  console.log(`User ID: ${userId}`);
  console.log('');
  console.log('Account Details:');
  console.log(`  Account ID: ${accountId}`);
  console.log('');
  console.log('Card Details:');
  console.log(`  Card ID: ${cardId}`);
  console.log('');
  console.log('Webhook URL to configure:');
  console.log(`  ${webhookBase}/api/unit/webhook`);
}

run().catch((error) => {
  console.error('Unit import failed:', error);
  process.exit(1);
});
