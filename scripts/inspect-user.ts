import 'dotenv/config';
import { buildIncidentBundle } from '../lib/engine/incidentBundle';

async function run() {
  const userId = process.env.USER_ID || process.env.DEV_USER_ID;
  if (!userId) {
    throw new Error('Missing USER_ID or DEV_USER_ID');
  }
  const limit = process.env.INSPECT_LIMIT ? Number(process.env.INSPECT_LIMIT) : 20;
  const bundle = await buildIncidentBundle(userId, Number.isFinite(limit) ? limit : 20);
  console.log(JSON.stringify(bundle, null, 2));
}

run().catch((error) => {
  console.error('Inspect user failed:', error);
  process.exit(1);
});
