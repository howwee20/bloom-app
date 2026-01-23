import 'dotenv/config';
import { LiquidationEngine } from '../lib/engine/liquidation';

async function run() {
  const userId = process.env.DEV_USER_ID;
  if (!userId) {
    throw new Error('Missing DEV_USER_ID');
  }

  const engine = new LiquidationEngine();
  await engine.enqueueIfNeeded(userId);
  await engine.processQueued(5);
  console.log('Liquidation run complete.');
}

run().catch((error) => {
  console.error('Liquidation failed:', error);
  process.exit(1);
});
