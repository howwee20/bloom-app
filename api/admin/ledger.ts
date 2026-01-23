import { requireAdmin } from '@/lib/server/adminAuth';
import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { LedgerService } from '@/lib/engine/ledger';
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

    const ledger = new LedgerService();
    const { data: accounts, error } = await supabaseAdmin
      .from('ledger_accounts')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;

    const balances = await Promise.all((accounts || []).map(async (account) => {
      const balance = await ledger.getAccountBalanceCents(account.id);
      return { ...account, balance_cents: balance };
    }));

    const { data: entries } = await supabaseAdmin
      .from('ledger_journal_entries')
      .select('id, created_at, external_source, external_id, memo')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(25);

    return res.status(200).json({ accounts: balances, entries: entries || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return res.status(401).json({ error: message });
  }
}
