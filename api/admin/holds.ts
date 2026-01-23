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

    const { data, error } = await supabaseAdmin
      .from('card_holds')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return res.status(200).json({ holds: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return res.status(401).json({ error: message });
  }
}
