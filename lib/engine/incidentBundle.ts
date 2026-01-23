import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { SpendableEngine } from './spendable';

export async function buildIncidentBundle(userId: string, limit = 20) {
  const spendableEngine = new SpendableEngine();
  const spendable = await spendableEngine.computeSpendableNow(userId);

  const rawEvents = await supabaseAdmin
    .from('raw_events')
    .select('*')
    .eq('user_id', userId)
    .order('received_at', { ascending: false })
    .limit(limit);

  const normalizedEvents = await supabaseAdmin
    .from('normalized_events')
    .select('*')
    .eq('user_id', userId)
    .order('occurred_at', { ascending: false })
    .limit(limit);

  const holds = await supabaseAdmin
    .from('card_holds')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  const journalEntries = await supabaseAdmin
    .from('ledger_journal_entries')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  const entryIds = (journalEntries.data || []).map((entry) => entry.id);
  const postings = entryIds.length === 0
    ? { data: [] }
    : await supabaseAdmin
      .from('ledger_postings')
      .select('*')
      .in('journal_entry_id', entryIds);

  const reconcile = await supabaseAdmin
    .from('reconciliation_reports')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (rawEvents.error) throw rawEvents.error;
  if (normalizedEvents.error) throw normalizedEvents.error;
  if (holds.error) throw holds.error;
  if (journalEntries.error) throw journalEntries.error;
  if ('error' in postings && postings.error) throw postings.error;
  if (reconcile.error) throw reconcile.error;

  return {
    user_id: userId,
    spendable,
    raw_events: rawEvents.data,
    normalized_events: normalizedEvents.data,
    card_holds: holds.data,
    journal_entries: journalEntries.data,
    ledger_postings: postings.data,
    reconciliation_report: reconcile.data,
  };
}
