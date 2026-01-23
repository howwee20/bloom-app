import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { EventStore } from './eventStore';
import { LedgerService } from './ledger';
import { ReceiptBuilder } from './receipts';
import { SpendableEngine } from './spendable';

export type CardAuthPayload = {
  external_id: string;
  user_id: string;
  merchant_name: string;
  mcc?: string;
  amount_cents: number;
  expires_at?: string;
};

export type CardSettlementPayload = {
  external_id: string;
  user_id: string;
  merchant_name: string;
  amount_cents: number;
  auth_id?: string | null;
};

export type CardReversalPayload = {
  external_id: string;
  user_id: string;
  auth_id: string;
  amount_cents: number;
};

export type CardRefundPayload = {
  external_id: string;
  user_id: string;
  merchant_name: string;
  amount_cents: number;
  auth_id?: string | null;
};

export type CardDisputePayload = {
  external_id: string;
  user_id: string;
  auth_id?: string | null;
  amount_cents?: number;
  reason?: string;
};

type CardEventContext = {
  source: string;
  raw_event_id?: string | null;
};

const STATUS = {
  requested: 'auth_requested',
  held: 'held',
  settled: 'settled',
  reversed: 'reversed',
  refunded: 'refunded',
  disputed: 'disputed',
  expired: 'expired',
} as const;

export class CardService {
  private eventStore = new EventStore();
  private ledger = new LedgerService();
  private receipts = new ReceiptBuilder();
  private spendable = new SpendableEngine();

  private async upsertAuthState(
    userId: string,
    authId: string,
    updates: Partial<{ merchant_name: string; mcc: string | null; amount_cents: number; captured_cents: number; refunded_cents: number; bridge_cents: number; status: string; expires_at: string | null; last_event_id: string }>
  ) {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('card_auths')
      .select('*')
      .eq('auth_id', authId)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existing) {
      const next = {
        merchant_name: updates.merchant_name ?? existing.merchant_name,
        mcc: updates.mcc ?? existing.mcc,
        amount_cents: updates.amount_cents ?? existing.amount_cents,
        captured_cents: updates.captured_cents ?? existing.captured_cents,
        refunded_cents: updates.refunded_cents ?? existing.refunded_cents,
        bridge_cents: updates.bridge_cents ?? existing.bridge_cents,
        status: updates.status ?? existing.status,
        expires_at: updates.expires_at ?? existing.expires_at,
        last_event_id: updates.last_event_id ?? existing.last_event_id,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabaseAdmin
        .from('card_auths')
        .update(next)
        .eq('id', existing.id)
        .select('*')
        .single();

      if (error || !data) throw error;
      return data;
    }

    const { data, error } = await supabaseAdmin
      .from('card_auths')
      .insert({
        user_id: userId,
        auth_id: authId,
        merchant_name: updates.merchant_name ?? null,
        mcc: updates.mcc ?? null,
        amount_cents: updates.amount_cents ?? 0,
        captured_cents: updates.captured_cents ?? 0,
        refunded_cents: updates.refunded_cents ?? 0,
        bridge_cents: updates.bridge_cents ?? 0,
        status: updates.status ?? STATUS.requested,
        expires_at: updates.expires_at ?? null,
        last_event_id: updates.last_event_id ?? null,
      })
      .select('*')
      .single();

    if (error || !data) throw error;
    return data;
  }

  private deriveStatus(state: { status: string; captured_cents: number; refunded_cents: number }) {
    if (state.status === STATUS.disputed) return STATUS.disputed;
    if (state.refunded_cents > 0 && state.refunded_cents >= state.captured_cents && state.captured_cents > 0) {
      return STATUS.refunded;
    }
    if (state.captured_cents > 0) return STATUS.settled;
    if (state.status === STATUS.reversed || state.status === STATUS.expired) return state.status;
    return STATUS.held;
  }

  private async ensureHold(userId: string, authId: string, merchant: string, amount: number, status: 'active' | 'released' | 'captured' | 'expired') {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('card_holds')
      .select('*')
      .eq('external_auth_id', authId)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existing) {
      const { data, error } = await supabaseAdmin
        .from('card_holds')
        .update({
          amount_cents: Math.max(existing.amount_cents, amount),
          status,
          merchant_name: merchant,
        })
        .eq('id', existing.id)
        .select('*')
        .single();

      if (error || !data) throw error;
      return data;
    }

    const { data, error } = await supabaseAdmin
      .from('card_holds')
      .insert({
        user_id: userId,
        merchant_name: merchant,
        mcc: null,
        amount_cents: amount,
        status,
        external_auth_id: authId,
      })
      .select('*')
      .single();

    if (error || !data) throw error;
    return data;
  }

  private async recordBridgeEntry(userId: string, authId: string, bridgeCents: number) {
    if (bridgeCents <= 0) return;
    const accounts = await this.ledger.ensureCoreAccounts(userId);
    await this.ledger.postJournalEntry({
      user_id: userId,
      external_source: 'bridge',
      external_id: `bridge-${authId}`,
      memo: 'Bridge authorization',
      postings: [
        {
          ledger_account_id: accounts.bridge_receivable.id,
          direction: 'debit',
          amount_cents: bridgeCents,
        },
        {
          ledger_account_id: accounts.bridge_offset.id,
          direction: 'credit',
          amount_cents: bridgeCents,
        },
      ],
    });
  }

  async handleAuthRequest(payload: CardAuthPayload, context: CardEventContext) {
    const normalized = await this.eventStore.recordNormalizedEvent({
      source: context.source,
      domain: 'card',
      event_type: 'auth_request',
      external_id: payload.external_id,
      user_id: payload.user_id,
      status: STATUS.held,
      amount_cents: payload.amount_cents,
      raw_event_id: context.raw_event_id ?? null,
      metadata: { merchant_name: payload.merchant_name, mcc: payload.mcc ?? null },
    });

    if (!normalized.isNew) {
      return { approved: true, reason_code: null };
    }

    const spendable = await this.spendable.computeSpendableNow(payload.user_id);
    const cashAvailable = Math.max(0, spendable.cash_balance_cents - spendable.active_holds_cents - spendable.buffer_cents);
    const spendPowerAvailable = spendable.spend_power_cents ?? cashAvailable;

    const bridgeEnabled = spendable.bridge_enabled;
    const bridgeLimit = spendable.bridge_limit_cents ?? 0;
    const canCover = cashAvailable >= payload.amount_cents;
    const bridgeNeeded = canCover ? 0 : Math.max(0, payload.amount_cents - cashAvailable);
    const bridgeAllowed = bridgeEnabled
      && spendPowerAvailable >= payload.amount_cents
      && (bridgeLimit <= 0 || bridgeNeeded <= bridgeLimit);
    const approved = canCover || bridgeAllowed;

    if (!approved) {
      return { approved: false, reason_code: 'insufficient_funds' };
    }

    const { data: existingAuth } = await supabaseAdmin
      .from('card_auths')
      .select('status, bridge_cents')
      .eq('auth_id', payload.external_id)
      .maybeSingle();

    if (existingAuth && [STATUS.settled, STATUS.refunded, STATUS.disputed].includes(existingAuth.status)) {
      return { approved: true, reason_code: null, bridge_cents: existingAuth.bridge_cents };
    }

    await this.upsertAuthState(payload.user_id, payload.external_id, {
      merchant_name: payload.merchant_name,
      mcc: payload.mcc ?? null,
      amount_cents: payload.amount_cents,
      status: STATUS.held,
      expires_at: payload.expires_at ?? null,
      bridge_cents: bridgeNeeded,
      last_event_id: normalized.event.id,
    });

    await this.ensureHold(payload.user_id, payload.external_id, payload.merchant_name, payload.amount_cents, 'active');

    if (bridgeNeeded > 0) {
      await this.recordBridgeEntry(payload.user_id, payload.external_id, bridgeNeeded);
    }

    await this.receipts.recordAuthHold(
      payload.user_id,
      payload.merchant_name,
      payload.amount_cents,
      payload.external_id
    );

    return { approved: true, reason_code: null, bridge_cents: bridgeNeeded };
  }

  async handleSettlement(payload: CardSettlementPayload, context: CardEventContext) {
    const normalized = await this.eventStore.recordNormalizedEvent({
      source: context.source,
      domain: 'card',
      event_type: 'settlement',
      external_id: payload.external_id,
      user_id: payload.user_id,
      status: STATUS.settled,
      amount_cents: payload.amount_cents,
      raw_event_id: context.raw_event_id ?? null,
      metadata: { merchant_name: payload.merchant_name, auth_id: payload.auth_id ?? null },
    });

    if (!normalized.isNew) return;

    const accounts = await this.ledger.ensureCoreAccounts(payload.user_id);
    await this.ledger.postJournalEntry({
      user_id: payload.user_id,
      external_source: 'card',
      external_id: payload.external_id,
      memo: payload.merchant_name,
      postings: [
        {
          ledger_account_id: accounts.cash.id,
          direction: 'credit',
          amount_cents: Math.abs(payload.amount_cents),
        },
        {
          ledger_account_id: accounts.clearing.id,
          direction: 'debit',
          amount_cents: Math.abs(payload.amount_cents),
        },
      ],
    });

    const authId = payload.auth_id ?? payload.external_id;
    const { data: existingAuth } = await supabaseAdmin
      .from('card_auths')
      .select('*')
      .eq('auth_id', authId)
      .maybeSingle();

    const capturedTotal = (existingAuth?.captured_cents || 0) + Math.abs(payload.amount_cents);

    const authState = await this.upsertAuthState(payload.user_id, authId, {
      merchant_name: payload.merchant_name,
      amount_cents: Math.max(existingAuth?.amount_cents || 0, Math.abs(payload.amount_cents)),
      captured_cents: capturedTotal,
      status: STATUS.settled,
      last_event_id: normalized.event.id,
    });

    await supabaseAdmin
      .from('card_holds')
      .update({ status: 'captured' })
      .eq('external_auth_id', authId);

    const nextStatus = this.deriveStatus(authState);
    if (nextStatus !== authState.status) {
      await this.upsertAuthState(payload.user_id, authId, {
        status: nextStatus,
      });
    }

    await this.receipts.recordSettlement(
      payload.user_id,
      payload.merchant_name,
      Math.abs(payload.amount_cents),
      payload.external_id
    );
  }

  async handleReversal(payload: CardReversalPayload, context: CardEventContext) {
    const normalized = await this.eventStore.recordNormalizedEvent({
      source: context.source,
      domain: 'card',
      event_type: 'reversal',
      external_id: payload.external_id,
      user_id: payload.user_id,
      status: STATUS.reversed,
      amount_cents: payload.amount_cents,
      raw_event_id: context.raw_event_id ?? null,
      metadata: { auth_id: payload.auth_id },
    });

    if (!normalized.isNew) return;

    const authState = await this.upsertAuthState(payload.user_id, payload.auth_id, {
      status: STATUS.reversed,
      last_event_id: normalized.event.id,
    });

    if (authState.captured_cents === 0) {
      await supabaseAdmin
        .from('card_holds')
        .update({ status: 'released' })
        .eq('external_auth_id', payload.auth_id);

      await this.receipts.recordReceipt({
        user_id: payload.user_id,
        type: 'reversal',
        title: 'Authorization released',
        subtitle: 'Hold removed',
        amount_cents: 0,
        metadata: {
          external_id: payload.external_id,
          what_happened: 'Authorization reversed.',
          what_changed: 'Hold released.',
          whats_next: 'Spendable restored.',
        },
      });
    }
  }

  async handleRefund(payload: CardRefundPayload, context: CardEventContext) {
    const normalized = await this.eventStore.recordNormalizedEvent({
      source: context.source,
      domain: 'card',
      event_type: 'refund',
      external_id: payload.external_id,
      user_id: payload.user_id,
      status: STATUS.refunded,
      amount_cents: payload.amount_cents,
      raw_event_id: context.raw_event_id ?? null,
      metadata: { auth_id: payload.auth_id ?? null, merchant_name: payload.merchant_name },
    });

    if (!normalized.isNew) return;

    const accounts = await this.ledger.ensureCoreAccounts(payload.user_id);
    await this.ledger.postJournalEntry({
      user_id: payload.user_id,
      external_source: 'card_refund',
      external_id: payload.external_id,
      memo: payload.merchant_name,
      postings: [
        {
          ledger_account_id: accounts.cash.id,
          direction: 'debit',
          amount_cents: Math.abs(payload.amount_cents),
        },
        {
          ledger_account_id: accounts.clearing.id,
          direction: 'credit',
          amount_cents: Math.abs(payload.amount_cents),
        },
      ],
    });

    const authId = payload.auth_id ?? payload.external_id;
    const { data: existingAuth } = await supabaseAdmin
      .from('card_auths')
      .select('*')
      .eq('auth_id', authId)
      .maybeSingle();

    const refundedTotal = (existingAuth?.refunded_cents || 0) + Math.abs(payload.amount_cents);

    const authState = await this.upsertAuthState(payload.user_id, authId, {
      refunded_cents: refundedTotal,
      status: STATUS.refunded,
      last_event_id: normalized.event.id,
    });

    const nextStatus = this.deriveStatus(authState);
    if (nextStatus !== authState.status) {
      await this.upsertAuthState(payload.user_id, authId, {
        status: nextStatus,
      });
    }

    await this.receipts.recordReceipt({
      user_id: payload.user_id,
      type: 'refund',
      title: payload.merchant_name,
      subtitle: 'Refund posted',
      amount_cents: Math.abs(payload.amount_cents),
      metadata: {
        external_id: payload.external_id,
        what_happened: 'Refund posted.',
        what_changed: 'Cash balance increased.',
        whats_next: 'Funds are available now.',
      },
    });
  }

  async handleDispute(payload: CardDisputePayload, context: CardEventContext) {
    const normalized = await this.eventStore.recordNormalizedEvent({
      source: context.source,
      domain: 'card',
      event_type: 'dispute',
      external_id: payload.external_id,
      user_id: payload.user_id,
      status: STATUS.disputed,
      amount_cents: payload.amount_cents ?? null,
      raw_event_id: context.raw_event_id ?? null,
      metadata: { auth_id: payload.auth_id ?? null, reason: payload.reason ?? null },
    });

    if (!normalized.isNew) return;

    if (payload.auth_id) {
      await this.upsertAuthState(payload.user_id, payload.auth_id, {
        status: STATUS.disputed,
        last_event_id: normalized.event.id,
      });
    }

    await this.receipts.recordReceipt({
      user_id: payload.user_id,
      type: 'dispute',
      title: 'Dispute filed',
      subtitle: payload.reason ?? 'Card dispute',
      amount_cents: 0,
      metadata: {
        external_id: payload.external_id,
        what_happened: 'Dispute opened.',
        what_changed: 'Funds under review.',
        whats_next: 'We will notify you with the outcome.',
      },
    });
  }
}
