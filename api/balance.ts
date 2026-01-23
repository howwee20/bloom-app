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
    const spendable = await engine.computeSpendableNow(userId);
    const flip = await engine.computeFlip(userId);

    const totalValueCents = flip.holdings.reduce((sum, h) => sum + h.amount_cents, 0);

    return res.status(200).json({
      spendable_cents: spendable.spendable_cents,
      total_value_cents: totalValueCents,
      day_pnl_cents: 0,
      updated_at: new Date().toISOString(),
      spend_power_cents: spendable.spend_power_cents,
      bridge_outstanding_cents: spendable.bridge_outstanding_cents,
      balance_mode: spendable.balance_mode,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return res.status(500).json({ error: message });
  }
}
