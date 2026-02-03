import 'dotenv/config';
import { BaseUsdcIndexer } from '../providers/base_usdc';

async function runOnce(indexer: BaseUsdcIndexer) {
  try {
    await indexer.tick();
    console.log('[base-usdc-indexer] tick complete');
  } catch (error) {
    console.error('[base-usdc-indexer] tick failed', error);
  }
}

async function main() {
  const indexer = new BaseUsdcIndexer();
  const intervalMs = Number(process.env.BASE_INDEXER_INTERVAL_MS || 15000);
  const runOnceOnly = process.env.BASE_INDEXER_ONCE === 'true';

  await runOnce(indexer);
  if (runOnceOnly) return;

  setInterval(() => {
    void runOnce(indexer);
  }, intervalMs);
}

void main();
