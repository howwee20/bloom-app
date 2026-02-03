import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { requireAgentOrAdmin } from '@/lib/server/agentAuth';
import { BaseUsdcExecutionService } from '@/lib/engine/baseUsdc/execution';
import { logAdapterSummary } from '@/lib/server/envSummary';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    logAdapterSummary();
    const { quote_id, idempotency_key, step_up_token, signed_payload } = req.body || {};
    if (!quote_id || !idempotency_key) {
      return res.status(400).json({ error: 'Missing request fields' });
    }

    const { data: quote, error } = await supabaseAdmin
      .from('quotes')
      .select('user_id, agent_id')
      .eq('quote_id', quote_id)
      .maybeSingle();
    if (error) throw error;
    if (!quote) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    await requireAgentOrAdmin(req, quote.user_id, quote.agent_id);

    const engine = new BaseUsdcExecutionService();
    const result = await engine.execute({
      quote_id,
      idempotency_key,
      step_up_token,
      signed_payload,
    });

    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    const status = message === 'Unauthorized' || message === 'Missing agent_id' ? 401 : 500;
    return res.status(status).json({ error: message });
  }
}
