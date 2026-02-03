import { SpendPowerEngine } from '@/lib/engine/spendPower';
import { getUserIdFromRequest } from '@/lib/server/auth';
import { logAdapterSummary } from '@/lib/server/envSummary';

function formatAge(ageSeconds: number | null) {
  if (ageSeconds === null) return null;
  if (ageSeconds < 60) return `${Math.floor(ageSeconds)}s ago`;
  if (ageSeconds < 3600) return `${Math.floor(ageSeconds / 60)}m ago`;
  return `${Math.floor(ageSeconds / 3600)}h ago`;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    logAdapterSummary();
    const userId = await getUserIdFromRequest(req);
    const engine = new SpendPowerEngine();
    const result = await engine.calculateSpendPower(userId, { includeReceipts: true });

    return res.status(200).json({
      spend_power_cents: result.spend_power_cents,
      breakdown: {
        settled_cash_cents: result.settled_cash_cents,
        active_holds_cents: result.active_holds_cents,
        active_reserves_cents: result.active_reserves_cents,
        safety_buffer_cents: result.safety_buffer_cents,
        degradation_buffer_cents: result.degradation_buffer_cents,
      },
      freshness_status: result.freshness_status,
      updated_at: result.updated_at,
      updated_ago: formatAge(result.updated_age_seconds),
      flags: result.flags,
      receipts_preview: result.receipts_preview ?? [],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return res.status(500).json({ error: message });
  }
}
