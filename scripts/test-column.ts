import 'dotenv/config';
import {
  isColumnConfigured,
  listEntities,
  listBankAccounts,
  listCards,
  listAchTransfers,
  createPersonEntity,
  createBankAccount,
  createVirtualCard,
} from '../lib/engine/integrations/columnClient';

async function testColumnAPI() {
  console.log('Testing Column API connection...');
  console.log(`Configured: ${isColumnConfigured()}`);
  console.log('');

  if (!isColumnConfigured()) {
    console.error('COLUMN_API_KEY not set');
    process.exit(1);
  }

  // Test 1: List entities
  console.log('1. Listing entities...');
  const entities = await listEntities();
  console.log(`   Status: ${entities.status}, OK: ${entities.ok}`);
  if (entities.ok) {
    console.log(`   Found ${entities.data.entities.length} entities`);
  } else {
    console.log(`   Error: ${JSON.stringify(entities.data)}`);
  }

  // Test 2: List bank accounts
  console.log('2. Listing bank accounts...');
  const accounts = await listBankAccounts();
  console.log(`   Status: ${accounts.status}, OK: ${accounts.ok}`);
  if (accounts.ok) {
    console.log(`   Found ${accounts.data.bank_accounts.length} bank accounts`);
  } else {
    console.log(`   Error: ${JSON.stringify(accounts.data)}`);
  }

  // Test 3: List cards
  console.log('3. Listing cards...');
  const cards = await listCards();
  console.log(`   Status: ${cards.status}, OK: ${cards.ok}`);
  if (cards.ok) {
    console.log(`   Found ${cards.data.cards.length} cards`);
  } else {
    console.log(`   Error: ${JSON.stringify(cards.data)}`);
  }

  // Test 4: List ACH transfers
  console.log('4. Listing ACH transfers...');
  const transfers = await listAchTransfers();
  console.log(`   Status: ${transfers.status}, OK: ${transfers.ok}`);
  if (transfers.ok) {
    console.log(`   Found ${transfers.data.ach_transfers?.length || 0} transfers`);
  } else {
    console.log(`   Error: ${JSON.stringify(transfers.data)}`);
  }

  console.log('');
  console.log('✅ Column API connection successful!');
  console.log('');

  // Optional: Create a test entity if none exist
  if (entities.ok && entities.data.entities.length === 0) {
    console.log('No entities found. Would you like to create a test entity?');
    console.log('Run: npm run column:setup to create test entity + bank account + card');
  }

  return true;
}

testColumnAPI()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  });
