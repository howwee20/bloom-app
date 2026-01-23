import { LiquidationEngine } from '@/lib/engine/liquidation';
import { getUserIdFromRequest } from '@/lib/server/auth';
import { logAdapterSummary } from '@/lib/server/envSummary';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    logAdapterSummary();
    const userId = req.query.user_id ? String(req.query.user_id) : await getUserIdFromRequest(req);
    const engine = new LiquidationEngine();
    await engine.enqueueIfNeeded(userId);
    await engine.processQueued(5);
    return res.status(200).json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return res.status(500).json({ error: message });
  }
}
