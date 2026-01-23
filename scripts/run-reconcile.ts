import 'dotenv/config';
import { ReconciliationService } from '../lib/engine/reconcile';

async function run() {
  const userId = process.env.DEV_USER_ID;
  if (!userId) {
    throw new Error('Missing DEV_USER_ID');
  }

  const service = new ReconciliationService();
  const report = await service.reconcileUser(userId);
  console.log('Reconciliation report:', report);
}

run().catch((error) => {
  console.error('Reconcile failed:', error);
  process.exit(1);
});
