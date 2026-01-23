import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { EventStore } from './eventStore';
import { LedgerService } from './ledger';
import { ReceiptBuilder } from './receipts';

type AchEventPayload = {
  external_id: string;
  user_id: string;
  amount_cents: number;
  direction: 'credit' | 'debit';
  status: 'pending' | 'posted' | 'returned';
  occurred_at?: string;
};

type AchEventContext = {
  source: string;
  raw_event_id?: string | null;
};

export class AchService {
  private eventStore = new EventStore();
  private ledger = new LedgerService();
  private receipts = new ReceiptBuilder();

  async handleEvent(payload: AchEventPayload, context: AchEventContext) {
    const normalized = await this.eventStore.recordNormalizedEvent({
      source: context.source,
      domain: 'ach',
      event_type: `ach_${payload.status}`,
      external_id: payload.external_id,
      user_id: payload.user_id,
      status: payload.status,
      amount_cents: payload.amount_cents,
      raw_event_id: context.raw_event_id ?? null,
      occurred_at: payload.occurred_at ?? null,
      metadata: { direction: payload.direction },
    });

    if (!normalized.isNew) return;

    const existing = await supabaseAdmin
      .from('ach_transfers')
      .select('*')
      .eq('external_id', payload.external_id)
      .maybeSingle();

    if (existing.error) throw existing.error;

    const nextStatus = existing.data?.status === 'returned'
      ? 'returned'
      : payload.status;
    if (existing.data) {
      await supabaseAdmin
        .from('ach_transfers')
        .update({
          status: nextStatus,
          amount_cents: payload.amount_cents,
          direction: payload.direction,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.data.id);
    } else {
      await supabaseAdmin
        .from('ach_transfers')
        .insert({
          user_id: payload.user_id,
          external_id: payload.external_id,
          amount_cents: payload.amount_cents,
          direction: payload.direction,
          status: nextStatus,
          occurred_at: payload.occurred_at ?? new Date().toISOString(),
          raw_event_id: context.raw_event_id ?? null,
        });
    }

    if (payload.status === 'posted' && existing.data?.status !== 'returned') {
      const accounts = await this.ledger.ensureCoreAccounts(payload.user_id);
      const isCredit = payload.direction === 'credit';
      await this.ledger.postJournalEntry({
        user_id: payload.user_id,
        external_source: 'ach',
        external_id: payload.external_id,
        memo: isCredit ? 'ACH deposit' : 'ACH withdrawal',
        postings: [
          {
            ledger_account_id: accounts.cash.id,
            direction: isCredit ? 'debit' : 'credit',
            amount_cents: Math.abs(payload.amount_cents),
          },
          {
            ledger_account_id: accounts.clearing.id,
            direction: isCredit ? 'credit' : 'debit',
            amount_cents: Math.abs(payload.amount_cents),
          },
        ],
      });

      if (isCredit) {
        await this.receipts.recordDeposit(payload.user_id, payload.amount_cents, payload.external_id);
      } else {
        await this.receipts.recordReceipt({
          user_id: payload.user_id,
          type: 'transfer',
          title: 'ACH withdrawal',
          subtitle: 'Transfer out',
          amount_cents: -Math.abs(payload.amount_cents),
          metadata: {
            external_id: payload.external_id,
            what_happened: 'ACH withdrawal posted.',
            what_changed: 'Cash balance decreased.',
            whats_next: 'Funds are outbound.',
          },
        });
      }
    }

    if (payload.status === 'returned') {
      const accounts = await this.ledger.ensureCoreAccounts(payload.user_id);
      const isCredit = payload.direction === 'credit';
      await this.ledger.postJournalEntry({
        user_id: payload.user_id,
        external_source: 'ach_return',
        external_id: payload.external_id,
        memo: 'ACH return',
        postings: [
          {
            ledger_account_id: accounts.cash.id,
            direction: isCredit ? 'credit' : 'debit',
            amount_cents: Math.abs(payload.amount_cents),
          },
          {
            ledger_account_id: accounts.clearing.id,
            direction: isCredit ? 'debit' : 'credit',
            amount_cents: Math.abs(payload.amount_cents),
          },
        ],
      });

      await this.receipts.recordReceipt({
        user_id: payload.user_id,
        type: 'ach_return',
        title: 'ACH return',
        subtitle: 'Transfer reversed',
        amount_cents: isCredit ? -Math.abs(payload.amount_cents) : Math.abs(payload.amount_cents),
        metadata: {
          external_id: payload.external_id,
          what_happened: 'ACH returned.',
          what_changed: 'Cash balance adjusted.',
          whats_next: 'Contact support if unexpected.',
        },
      });
    }
  }
}
