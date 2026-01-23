import 'dotenv/config';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { supabaseAdmin } from '../lib/server/supabaseAdmin';
import { ExternalLinkService } from '../lib/engine/externalLinks';
import {
  getEntity,
  getBankAccountBalance,
  getCard,
  isColumnConfigured,
} from '../lib/engine/integrations/columnClient';

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
  if (!isColumnConfigured()) {
    throw new Error('COLUMN_API_KEY is not configured');
  }

  const userId = await ensureDevUser();

  const entityId = await promptIfMissing('COLUMN_ENTITY_ID', process.env.COLUMN_ENTITY_ID);
  const bankAccountId = await promptIfMissing('COLUMN_BANK_ACCOUNT_ID', process.env.COLUMN_BANK_ACCOUNT_ID);
  const cardId = await promptIfMissing('COLUMN_CARD_ID', process.env.COLUMN_CARD_ID);

  const entity = await getEntity(entityId);
  if (!entity.ok) {
    throw new Error(`Entity lookup failed (${entity.status})`);
  }

  const bankAccount = await getBankAccountBalance(bankAccountId);
  if (!bankAccount.ok) {
    throw new Error(`Bank account lookup failed (${bankAccount.status})`);
  }

  const card = await getCard(cardId);
  if (!card.ok) {
    throw new Error(`Card lookup failed (${card.status})`);
  }

  const externalLinks = new ExternalLinkService();
  await externalLinks.upsertLink({
    user_id: userId,
    provider: 'column',
    entity_id: entityId,
    bank_account_id: bankAccountId,
    card_id: cardId,
    metadata_json: {
      entity_status: entity.data.status,
      entity_type: entity.data.type,
      bank_account_status: bankAccount.data.status,
      card_status: card.data.status,
      card_last4: card.data.last_four,
      card_type: card.data.type,
    },
  });

  const webhookBase = process.env.BLOOM_WEBHOOK_BASE_URL || process.env.EXPO_PUBLIC_API_BASE_URL || 'https://your-domain';

  console.log('✅ Column import complete');
  console.log(`User ID: ${userId}`);
  console.log('');
  console.log('Direct Deposit Details:');
  console.log(`  Routing: ${bankAccount.data.routing_number}`);
  console.log(`  Account: ${bankAccount.data.account_number}`);
  console.log(`  Account Type: ${bankAccount.data.type}`);
  console.log('');
  console.log('Card Details:');
  console.log(`  Card ID: ${card.data.id}`);
  console.log(`  Status: ${card.data.status}`);
  console.log(`  Last 4: ${card.data.last_four}`);
  console.log('');
  console.log('Webhook URL to configure:');
  console.log(`  ${webhookBase}/api/webhooks/column/auth_request`);
  console.log(`  ${webhookBase}/api/webhooks/column/transaction_posted`);
  console.log(`  ${webhookBase}/api/webhooks/column/ach_event`);
}

run().catch((error) => {
  console.error('Column import failed:', error);
  process.exit(1);
});
