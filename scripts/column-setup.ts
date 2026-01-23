import 'dotenv/config';
import {
  isColumnConfigured,
  listEntities,
  listBankAccounts,
  listCards,
  createPersonEntity,
  createBankAccount,
  createVirtualCard,
} from '../lib/engine/integrations/columnClient';

async function setupColumn() {
  console.log('Setting up Column test environment...');
  console.log('');

  if (!isColumnConfigured()) {
    console.error('COLUMN_API_KEY not set');
    process.exit(1);
  }

  // Step 1: Check for existing entity or create one
  console.log('1. Checking for existing entity...');
  const entities = await listEntities();
  let entityId: string;

  if (entities.ok && entities.data.entities.length > 0) {
    entityId = entities.data.entities[0].id;
    console.log(`   Found existing entity: ${entityId}`);
  } else {
    console.log('   Creating new test entity...');
    const newEntity = await createPersonEntity({
      first_name: 'Bloom',
      last_name: 'Test',
      email: 'test@bloom.local',
      phone: '+15551234567',
      date_of_birth: '1990-01-15',
      address: {
        line_1: '123 Test Street',
        city: 'San Francisco',
        state: 'CA',
        postal_code: '94105',
        country_code: 'US',
      },
    });

    if (!newEntity.ok) {
      console.error(`   Failed to create entity: ${JSON.stringify(newEntity.data)}`);
      process.exit(1);
    }
    entityId = newEntity.data.id;
    console.log(`   Created entity: ${entityId}`);
  }

  // Step 2: Check for existing bank account or create one
  console.log('2. Checking for existing bank account...');
  const accounts = await listBankAccounts(entityId);
  let bankAccountId: string;

  if (accounts.ok && accounts.data.bank_accounts.length > 0) {
    bankAccountId = accounts.data.bank_accounts[0].id;
    const acct = accounts.data.bank_accounts[0];
    console.log(`   Found existing account: ${bankAccountId}`);
    console.log(`   Routing: ${acct.routing_number}, Account: ***${acct.account_number?.slice(-4) || '****'}`);
    console.log(`   Balance: $${((acct.balances?.available_amount || 0) / 100).toFixed(2)}`);
  } else {
    console.log('   Creating new bank account...');
    const newAccount = await createBankAccount(entityId, 'CHECKING');

    if (!newAccount.ok) {
      console.error(`   Failed to create bank account: ${JSON.stringify(newAccount.data)}`);
      process.exit(1);
    }
    bankAccountId = newAccount.data.id;
    console.log(`   Created bank account: ${bankAccountId}`);
    console.log(`   Routing: ${newAccount.data.routing_number}, Account: ***${newAccount.data.account_number?.slice(-4) || '****'}`);
  }

  // Step 3: Check for existing card or create one
  console.log('3. Checking for existing card...');
  const cards = await listCards(bankAccountId);
  let cardId: string;

  if (cards.ok && cards.data.cards.length > 0) {
    cardId = cards.data.cards[0].id;
    const card = cards.data.cards[0];
    console.log(`   Found existing card: ${cardId}`);
    console.log(`   Type: ${card.type}, Last 4: ${card.last_four}, Exp: ${card.expiration_month}/${card.expiration_year}`);
  } else {
    console.log('   Creating new virtual card...');
    const newCard = await createVirtualCard(bankAccountId);

    if (!newCard.ok) {
      console.error(`   Failed to create card: ${JSON.stringify(newCard.data)}`);
      process.exit(1);
    }
    cardId = newCard.data.id;
    console.log(`   Created card: ${cardId}`);
    console.log(`   Type: ${newCard.data.type}, Last 4: ${newCard.data.last_four}`);
  }

  console.log('');
  console.log('✅ Column setup complete!');
  console.log('');
  console.log('Summary:');
  console.log(`  Entity ID:       ${entityId}`);
  console.log(`  Bank Account ID: ${bankAccountId}`);
  console.log(`  Card ID:         ${cardId}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Fund the account via ACH or Column dashboard');
  console.log('  2. Configure webhook URL in Column dashboard');
  console.log('  3. Run npm run seed:ledger to sync with local ledger');
}

setupColumn()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Setup failed:', err);
    process.exit(1);
  });
