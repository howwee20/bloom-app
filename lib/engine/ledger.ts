import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import type { JournalEntryInput, LedgerPostingInput } from './types';

type LedgerAccount = {
  id: string;
  user_id: string;
  currency: string;
  kind: string;
  created_at: string;
};

type JournalEntry = {
  id: string;
  user_id: string;
  external_source: string;
  external_id: string;
  memo: string | null;
  created_at: string;
};

const ACCOUNT_KINDS = ['cash', 'clearing', 'fees'] as const;

export class LedgerService {
  async ensureAccount(userId: string, kind: string, currency = 'USD'): Promise<LedgerAccount> {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('ledger_accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('kind', kind)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existing) return existing as LedgerAccount;

    const { data, error } = await supabaseAdmin
      .from('ledger_accounts')
      .insert({
        user_id: userId,
        kind,
        currency,
      })
      .select('*')
      .single();

    if (error || !data) throw error;
    return data as LedgerAccount;
  }

  async ensureCoreAccounts(userId: string) {
    const accounts: Record<string, LedgerAccount> = {};
    for (const kind of ACCOUNT_KINDS) {
      accounts[kind] = await this.ensureAccount(userId, kind);
    }
    return accounts;
  }

  async postJournalEntry(input: JournalEntryInput): Promise<JournalEntry> {
    if (!input.postings.length) {
      throw new Error('Journal entry requires postings');
    }

    const totalDebits = input.postings
      .filter((p) => p.direction === 'debit')
      .reduce((sum, p) => sum + p.amount_cents, 0);
    const totalCredits = input.postings
      .filter((p) => p.direction === 'credit')
      .reduce((sum, p) => sum + p.amount_cents, 0);

    if (totalDebits !== totalCredits) {
      throw new Error('Journal entry must balance');
    }

    const { data: existing } = await supabaseAdmin
      .from('ledger_journal_entries')
      .select('*')
      .eq('external_source', input.external_source)
      .eq('external_id', input.external_id)
      .maybeSingle();

    if (existing) {
      return existing as JournalEntry;
    }

    const { data: entry, error: entryError } = await supabaseAdmin
      .from('ledger_journal_entries')
      .insert({
        user_id: input.user_id,
        external_source: input.external_source,
        external_id: input.external_id,
        memo: input.memo ?? null,
      })
      .select('*')
      .single();

    if (entryError || !entry) {
      throw entryError;
    }

    const postingsPayload = input.postings.map((posting: LedgerPostingInput) => ({
      journal_entry_id: entry.id,
      ledger_account_id: posting.ledger_account_id,
      direction: posting.direction,
      amount_cents: posting.amount_cents,
    }));

    const { error: postingsError } = await supabaseAdmin
      .from('ledger_postings')
      .insert(postingsPayload);

    if (postingsError) throw postingsError;
    return entry as JournalEntry;
  }

  async getAccountBalanceCents(accountId: string): Promise<number> {
    const { data, error } = await supabaseAdmin
      .from('ledger_postings')
      .select('direction, amount_cents')
      .eq('ledger_account_id', accountId);

    if (error) throw error;

    return (data || []).reduce((sum, row) => {
      const signed = row.direction === 'debit' ? row.amount_cents : -row.amount_cents;
      return sum + signed;
    }, 0);
  }

  async getUserCashBalanceCents(userId: string): Promise<number> {
    const account = await this.ensureAccount(userId, 'cash');
    return this.getAccountBalanceCents(account.id);
  }

  async getUserAccountByKind(userId: string, kind: string): Promise<LedgerAccount> {
    return this.ensureAccount(userId, kind);
  }
}
