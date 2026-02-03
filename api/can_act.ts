import { BaseUsdcExecutionService } from '@/lib/engine/baseUsdc/execution';
import { requireAgentOrAdmin } from '@/lib/server/agentAuth';
import { logAdapterSummary } from '@/lib/server/envSummary';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    logAdapterSummary();
    const { user_id, agent_id, intent, idempotency_key } = req.body || {};
    if (!user_id || !agent_id || !intent || !idempotency_key) {
      return res.status(400).json({ error: 'Missing request fields' });
    }

    await requireAgentOrAdmin(req, user_id, agent_id);

    const engine = new BaseUsdcExecutionService();
    const result = await engine.canAct({
      user_id,
      agent_id,
      intent,
      idempotency_key,
    });

    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    const status = message === 'Unauthorized' || message === 'Missing agent_id' ? 401 : 500;
    return res.status(status).json({ error: message });
  }
}
