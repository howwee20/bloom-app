import { requireAdmin } from '@/lib/server/adminAuth';
import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { logAdapterSummary } from '@/lib/server/envSummary';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    logAdapterSummary();
    requireAdmin(req);

    const userId = req.query.user_id as string | undefined;
    if (!userId) {
      return res.status(400).json({ error: 'Missing user_id' });
    }

    const { data: rawEvents } = await supabaseAdmin
      .from('raw_events')
      .select('id, source, event_type, external_id, received_at')
      .eq('user_id', userId)
      .order('received_at', { ascending: false })
      .limit(50);

    const { data: normalizedEvents } = await supabaseAdmin
      .from('normalized_events')
      .select('id, domain, event_type, status, amount_cents, occurred_at')
      .eq('user_id', userId)
      .order('occurred_at', { ascending: false })
      .limit(50);

    return res.status(200).json({ raw_events: rawEvents || [], normalized_events: normalizedEvents || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return res.status(401).json({ error: message });
  }
}
