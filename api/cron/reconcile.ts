import { ReconciliationService } from '@/lib/engine/reconcile';
import { getUserIdFromRequest } from '@/lib/server/auth';
import { logAdapterSummary } from '@/lib/server/envSummary';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    logAdapterSummary();
    const userId = req.query.user_id ? String(req.query.user_id) : await getUserIdFromRequest(req);
    const service = new ReconciliationService();
    const report = await service.reconcileUser(userId);
    return res.status(200).json({ report });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return res.status(500).json({ error: message });
  }
}
