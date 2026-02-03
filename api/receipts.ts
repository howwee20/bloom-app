import { BaseUsdcExecutionService } from '@/lib/engine/baseUsdc/execution';
import { getUserIdFromRequest } from '@/lib/server/auth';
import { requireAgentOrAdmin } from '@/lib/server/agentAuth';
import { logAdapterSummary } from '@/lib/server/envSummary';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    logAdapterSummary();
    const queryUserId = Array.isArray(req.query?.user_id) ? req.query.user_id[0] : req.query?.user_id;
    const queryAgentId = Array.isArray(req.query?.agent_id) ? req.query.agent_id[0] : req.query?.agent_id;
    const userId = queryUserId || await getUserIdFromRequest(req);

    if (queryUserId) {
      await requireAgentOrAdmin(req, userId, queryAgentId || null);
    }

    const limitRaw = Array.isArray(req.query?.limit) ? req.query.limit[0] : req.query?.limit;
    const limit = limitRaw ? Math.min(100, Number(limitRaw)) : 20;

    const engine = new BaseUsdcExecutionService();
    const receipts = await engine.listReceipts(userId, Number.isFinite(limit) ? limit : 20);

    return res.status(200).json({ receipts });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    const status = message === 'Unauthorized' || message === 'Missing agent_id' ? 401 : 500;
    return res.status(status).json({ error: message });
  }
}
