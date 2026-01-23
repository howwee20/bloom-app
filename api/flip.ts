import { SpendableEngine } from '@/lib/engine/spendable';
import { getUserIdFromRequest } from '@/lib/server/auth';
import { logAdapterSummary } from '@/lib/server/envSummary';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    logAdapterSummary();
    const userId = await getUserIdFromRequest(req);
    const engine = new SpendableEngine();
    const flip = await engine.computeFlip(userId);
    return res.status(200).json(flip);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return res.status(500).json({ error: message });
  }
}
