import { BaseUsdcSpendPowerEngine } from '@/lib/engine/baseUsdc/spendPower';
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

    const engine = new BaseUsdcSpendPowerEngine();
    const result = await engine.calculateSpendPower(userId, { includeReceipts: true });

    return res.status(200).json({
      spend_power_cents: result.spend_power_cents,
      breakdown: {
        confirmed_balance_cents: result.confirmed_balance_cents,
        active_reserves_cents: result.active_reserves_cents,
        safety_buffer_cents: result.safety_buffer_cents,
        degradation_buffer_cents: result.degradation_buffer_cents,
      },
      freshness_status: result.freshness_status,
      updated_ago_seconds: result.updated_ago_seconds,
      receipts_preview: result.receipts_preview ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    const status = message === 'Unauthorized' || message === 'Missing agent_id' ? 401 : 500;
    return res.status(status).json({ error: message });
  }
}
