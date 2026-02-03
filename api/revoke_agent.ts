import { BaseUsdcExecutionService } from '@/lib/engine/baseUsdc/execution';
import { requireAdmin } from '@/lib/server/adminAuth';
import { logAdapterSummary } from '@/lib/server/envSummary';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    logAdapterSummary();
    requireAdmin(req);

    const { user_id, agent_id } = req.body || {};
    if (!user_id || !agent_id) {
      return res.status(400).json({ error: 'Missing request fields' });
    }

    const engine = new BaseUsdcExecutionService();
    const result = await engine.revokeAgent({ user_id, agent_id });
    return res.status(200).json({ ok: true, agent: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    const status = message === 'Unauthorized' || message.includes('ADMIN_API_KEY') ? 401 : 500;
    return res.status(status).json({ error: message });
  }
}
