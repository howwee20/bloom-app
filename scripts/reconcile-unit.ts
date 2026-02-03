import 'dotenv/config';
import { UnitReconciliationService } from '../lib/engine/unitReconcile';

async function run() {
  const userId = process.env.DEV_USER_ID || process.argv[2];
  if (!userId) {
    throw new Error('Missing DEV_USER_ID or user id argument');
  }

  const service = new UnitReconciliationService();
  const report = await service.reconcileUser(userId);
  console.log('Unit reconciliation report:', report);
}

run().catch((error) => {
  console.error('Unit reconciliation failed:', error);
  process.exit(1);
});
