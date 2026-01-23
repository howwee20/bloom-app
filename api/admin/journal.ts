import { LedgerService } from '@/lib/engine/ledger';
import { requireAdmin } from '@/lib/server/adminAuth';
import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { logAdapterSummary } from '@/lib/server/envSummary';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    logAdapterSummary();
    requireAdmin(req);

    const { user_id, memo, postings } = req.body || {};
    if (!user_id || !postings || !Array.isArray(postings)) {
      return res.status(400).json({ error: 'Missing user_id or postings' });
    }

    const ledger = new LedgerService();
    const entry = await ledger.postJournalEntry({
      user_id,
      external_source: 'admin',
      external_id: `admin-${Date.now()}`,
      memo: memo ?? 'Admin entry',
      postings,
    });

    await supabaseAdmin
      .from('admin_actions')
      .insert({
        actor: (req.headers['x-admin-key'] as string) || 'admin',
        action: 'manual_journal_entry',
        target_user_id: user_id,
        metadata: { entry_id: entry.id },
      });

    return res.status(200).json({ entry });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return res.status(401).json({ error: message });
  }
}
