import { supabaseAdmin } from '@/lib/server/supabaseAdmin';

type RawEventRow = {
  id: string;
};

export type HoldStatus = 'active' | 'declined' | 'canceled' | 'expired' | 'released';

export type HoldUpdate = {
  holdId: string;
  accountId: string | null;
  merchantName: string | null;
  mcc: string | null;
  merchantId: string | null;
  amountCents: number;
  currency: string;
  status: HoldStatus;
  occurredAt: string;
  rawAuthorization: Record<string, unknown> | null;
};

export type TransactionUpdate = {
  transactionId: string;
  accountId: string | null;
  amountCents: number;
  currency: string;
  direction: string | null;
  status: string | null;
  occurredAt: string;
  relatedAuthorizationId: string | null;
  rawTransaction: Record<string, unknown> | null;
};

export type DisputeUpdate = {
  disputeId: string;
  transactionId: string | null;
  status: string | null;
  amountCents: number | null;
  reason: string | null;
  occurredAt: string;
};

export type SpendPowerEventBase = {
  provider: string;
  providerEventId: string | null;
  occurredAt: string;
  accountId: string | null;
  linkField?: 'bank_account_id' | 'card_id' | 'entity_id';
  userId?: string | null;
  rawEventId?: RawEventRow['id'] | null;
  receiptSource?: string;
};

export type SpendPowerHoldEvent = SpendPowerEventBase & {
  type: 'HOLD_CREATED' | 'HOLD_CHANGED' | 'HOLD_CANCELED' | 'HOLD_DECLINED';
  hold: HoldUpdate;
};

export type SpendPowerTransactionEvent = SpendPowerEventBase & {
  type: 'TXN_POSTED';
  transaction: TransactionUpdate;
};

export type SpendPowerDisputeEvent = SpendPowerEventBase & {
  type: 'DISPUTE_CREATED' | 'DISPUTE_UPDATED';
  dispute: DisputeUpdate;
};

export type SpendPowerEvent = SpendPowerHoldEvent | SpendPowerTransactionEvent | SpendPowerDisputeEvent;

function formatCents(amountCents: number) {
  const sign = amountCents < 0 ? '-' : '';
  const abs = Math.abs(amountCents);
  const dollars = (abs / 100).toFixed(2);
  return `${sign}$${dollars}`;
}

function mapDisputeStatus(status: string | null): 'opened' | 'triaging' | 'submitted' | 'waiting' | 'resolved' {
  if (!status) return 'waiting';
  const normalized = status.toLowerCase();
  if (normalized.includes('resolved') || normalized.includes('closed') || normalized.includes('won')) {
    return 'resolved';
  }
  if (normalized.includes('submitted')) return 'submitted';
  if (normalized.includes('open')) return 'opened';
  if (normalized.includes('triage')) return 'triaging';
  return 'waiting';
}

class SpendPowerReceiptService {
  async recordReceipt(input: {
    userId: string;
    source: string;
    providerEventId: string | null;
    relatedHoldId?: string | null;
    relatedTransactionId?: string | null;
    deltaSpendPowerCents?: number | null;
    whatHappened: string;
    whyChanged: string;
    whatHappensNext: string;
    fixCta?: string | null;
    occurredAt: string;
  }) {
    if (input.providerEventId) {
      const { data: existing, error } = await supabaseAdmin
        .from('receipts')
        .select('id')
        .eq('user_id', input.userId)
        .eq('provider_event_id', input.providerEventId)
        .eq('source', input.source)
        .maybeSingle();
      if (error) throw error;
      if (existing) return existing;
    }

    const amountCents = Math.abs(input.deltaSpendPowerCents ?? 0);
    const payload = {
      user_id: input.userId,
      type: input.source,
      title: input.whatHappened,
      subtitle: input.whyChanged,
      amount_cents: amountCents,
      occurred_at: input.occurredAt,
      metadata_json: {},
      source: input.source,
      provider_event_id: input.providerEventId,
      related_hold_id: input.relatedHoldId ?? null,
      related_transaction_id: input.relatedTransactionId ?? null,
      delta_spend_power_cents: input.deltaSpendPowerCents ?? null,
      what_happened: input.whatHappened,
      why_changed: input.whyChanged,
      what_happens_next: input.whatHappensNext,
      fix_cta: input.fixCta ?? null,
    };

    const { data, error } = await supabaseAdmin
      .from('receipts')
      .insert(payload)
      .select('id')
      .single();
    if (error) throw error;
    return data;
  }
}

export class SpendPowerKernel {
  private receipts = new SpendPowerReceiptService();

  private async resolveUserId(event: SpendPowerEventBase) {
    if (event.userId) return event.userId;
    if (!event.accountId) return null;

    const linkField = event.linkField || 'bank_account_id';
    const { data, error } = await supabaseAdmin
      .from('external_links')
      .select('user_id')
      .eq('provider', event.provider)
      .eq(linkField, event.accountId)
      .maybeSingle();
    if (error) throw error;
    return data?.user_id ?? null;
  }

  private async updateRawEventSuccess(rawEventId: string, occurredAt: string, userId: string) {
    await supabaseAdmin
      .from('raw_events')
      .update({
        processed_at: new Date().toISOString(),
        processing_error: null,
        occurred_at: occurredAt,
        user_id: userId,
      })
      .eq('id', rawEventId);
  }

  private async updateRawEventError(rawEventId: string, message: string) {
    await supabaseAdmin
      .from('raw_events')
      .update({ processing_error: message })
      .eq('id', rawEventId);
  }

  private async applyHoldUpdate(
    userId: string,
    update: HoldUpdate,
    providerEventId: string | null,
    eventType: SpendPowerHoldEvent['type'],
    receiptSource: string
  ) {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('auth_holds')
      .select('*')
      .eq('hold_id', update.holdId)
      .maybeSingle();
    if (existingError) throw existingError;

    const eventTime = new Date(update.occurredAt).getTime();
    const lastEventTime = existing?.last_event_occurred_at ? new Date(existing.last_event_occurred_at).getTime() : null;
    const isNewer = !lastEventTime || eventTime >= lastEventTime;

    const resolvedAmount = update.amountCents || Number(existing?.amount_cents || 0);
    const previousActive = existing?.status === 'active' ? Number(existing.amount_cents) : 0;
    const effectiveStatus = isNewer ? update.status : (existing?.status ?? update.status);
    const effectiveAmount = isNewer ? resolvedAmount : Number(existing?.amount_cents || resolvedAmount);
    const nextActive = effectiveStatus === 'active' ? effectiveAmount : 0;
    const deltaSpendPower = previousActive - nextActive;

    if (existing) {
      const nextPayload = {
        account_id: update.accountId ?? existing.account_id,
        merchant_name: existing.merchant_name ?? update.merchantName,
        mcc: existing.mcc ?? update.mcc,
        merchant_id: existing.merchant_id ?? update.merchantId,
        amount_cents: isNewer ? resolvedAmount : existing.amount_cents,
        currency: update.currency || existing.currency,
        status: isNewer ? update.status : existing.status,
        updated_at: new Date().toISOString(),
        last_event_occurred_at: isNewer ? update.occurredAt : existing.last_event_occurred_at,
        raw_authorization_json: update.rawAuthorization ?? existing.raw_authorization_json,
      };

      await supabaseAdmin
        .from('auth_holds')
        .update(nextPayload)
        .eq('hold_id', update.holdId);
    } else {
      await supabaseAdmin
        .from('auth_holds')
        .insert({
          hold_id: update.holdId,
          account_id: update.accountId,
          user_id: userId,
          amount_cents: update.amountCents,
          currency: update.currency,
          merchant_name: update.merchantName,
          mcc: update.mcc,
          merchant_id: update.merchantId,
          status: update.status,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          last_event_occurred_at: update.occurredAt,
          raw_authorization_json: update.rawAuthorization,
        });
    }

    if (!isNewer && deltaSpendPower === 0) {
      return;
    }

    if (eventType === 'HOLD_CHANGED' && deltaSpendPower === 0) {
      return;
    }

    const merchantLabel = update.merchantName || 'Card merchant';
    let whatHappened = `${merchantLabel} authorization updated`;
    let whyChanged = 'Authorization details were updated.';
    let whatHappensNext = 'Hold stays until it settles or releases.';

    if (eventType === 'HOLD_CREATED') {
      whatHappened = `Card hold placed at ${merchantLabel}`;
      whyChanged = `A hold for ${formatCents(update.amountCents)} reduces spend power.`;
      whatHappensNext = 'Hold will release if not captured.';
    } else if (eventType === 'HOLD_CHANGED') {
      const diff = resolvedAmount - previousActive;
      whatHappened = `Hold amount changed at ${merchantLabel}`;
      whyChanged = `Hold changed by ${formatCents(diff)}.`;
      whatHappensNext = 'Await settlement or release.';
    } else if (eventType === 'HOLD_CANCELED') {
      whatHappened = `Hold released at ${merchantLabel}`;
      whyChanged = 'Merchant released the authorization hold.';
      whatHappensNext = 'Spend power should recover shortly.';
    } else if (eventType === 'HOLD_DECLINED') {
      whatHappened = `Authorization declined at ${merchantLabel}`;
      whyChanged = 'The authorization was declined.';
      whatHappensNext = 'Try another payment method.';
    }

    await this.receipts.recordReceipt({
      userId,
      source: receiptSource,
      providerEventId,
      relatedHoldId: update.holdId,
      deltaSpendPowerCents: deltaSpendPower,
      whatHappened,
      whyChanged,
      whatHappensNext,
      fixCta: 'Fix an issue',
      occurredAt: update.occurredAt,
    });
  }

  private async applyTransactionUpdate(
    userId: string,
    update: TransactionUpdate,
    providerEventId: string | null,
    receiptSource: string
  ) {
    await supabaseAdmin
      .from('transactions')
      .upsert({
        transaction_id: update.transactionId,
        account_id: update.accountId,
        user_id: userId,
        amount_cents: update.amountCents,
        currency: update.currency,
        direction: update.direction,
        status: update.status,
        created_at: update.occurredAt,
        related_authorization_id: update.relatedAuthorizationId,
        raw_transaction_json: update.rawTransaction,
      }, { onConflict: 'transaction_id' });

    let releasedAmount = 0;
    if (update.relatedAuthorizationId) {
      const { data: hold, error: holdError } = await supabaseAdmin
        .from('auth_holds')
        .select('*')
        .eq('hold_id', update.relatedAuthorizationId)
        .maybeSingle();
      if (holdError) throw holdError;
      if (hold && hold.status === 'active') {
        const eventTime = new Date(update.occurredAt).getTime();
        const lastEventTime = hold.last_event_occurred_at ? new Date(hold.last_event_occurred_at).getTime() : null;
        const isNewer = !lastEventTime || eventTime >= lastEventTime;
        if (isNewer) {
          releasedAmount = Number(hold.amount_cents);
          await supabaseAdmin
            .from('auth_holds')
            .update({
              status: 'released',
              updated_at: new Date().toISOString(),
              last_event_occurred_at: update.occurredAt,
            })
            .eq('hold_id', hold.hold_id);
        }
      }
    }

    const isDebit = update.direction === 'debit';
    const deltaSpendPower = (isDebit ? -update.amountCents : update.amountCents) + releasedAmount;
    const txnLabel = isDebit ? 'Card purchase posted' : 'Card refund posted';
    const whatHappened = `${txnLabel} for ${formatCents(update.amountCents)}`;
    const whyChanged = 'Posted transactions settle cash balance.';
    const whatHappensNext = isDebit ? 'Statement reflects the settled purchase.' : 'Refunds may take time to post.';

    await this.receipts.recordReceipt({
      userId,
      source: receiptSource,
      providerEventId,
      relatedTransactionId: update.transactionId,
      relatedHoldId: update.relatedAuthorizationId,
      deltaSpendPowerCents: deltaSpendPower,
      whatHappened,
      whyChanged,
      whatHappensNext,
      fixCta: 'Fix an issue',
      occurredAt: update.occurredAt,
    });
  }

  private async applyDisputeUpdate(
    userId: string,
    update: DisputeUpdate,
    providerEventId: string | null,
    receiptSource: string
  ) {
    const issueStatus = mapDisputeStatus(update.status);
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('issues')
      .select('*')
      .eq('user_id', userId)
      .eq('related_transaction_id', update.transactionId)
      .eq('category', 'dispute')
      .maybeSingle();
    if (existingError) throw existingError;

    if (existing) {
      await supabaseAdmin
        .from('issues')
        .update({
          status: issueStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('issue_id', existing.issue_id);
    } else {
      await supabaseAdmin
        .from('issues')
        .insert({
          user_id: userId,
          category: 'dispute',
          status: issueStatus,
          related_transaction_id: update.transactionId,
          description: update.reason || 'Dispute opened',
          evidence_json: { dispute_id: update.disputeId, status: update.status, amount_cents: update.amountCents },
        });
    }

    const whatHappened = update.status
      ? `Dispute status updated: ${update.status}`
      : 'Dispute opened';
    const whyChanged = update.amountCents != null
      ? `Dispute amount: ${formatCents(update.amountCents)}.`
      : 'Dispute recorded for review.';
    const whatHappensNext = 'We will notify you as the dispute progresses.';

    await this.receipts.recordReceipt({
      userId,
      source: receiptSource,
      providerEventId,
      relatedTransactionId: update.transactionId,
      deltaSpendPowerCents: 0,
      whatHappened,
      whyChanged,
      whatHappensNext,
      fixCta: 'Fix an issue',
      occurredAt: update.occurredAt,
    });
  }

  async processEvent(event: SpendPowerEvent): Promise<{ userId: string | null }> {
    const userId = await this.resolveUserId(event);

    if (!userId) {
      if (event.rawEventId) {
        await this.updateRawEventError(event.rawEventId, 'Unable to resolve user_id for spend power event');
      }
      return { userId: null };
    }

    try {
      const receiptSource = event.receiptSource || `${event.provider}_event`;
      if (event.type === 'TXN_POSTED') {
        await this.applyTransactionUpdate(userId, event.transaction, event.providerEventId, receiptSource);
      } else if (event.type === 'DISPUTE_CREATED' || event.type === 'DISPUTE_UPDATED') {
        await this.applyDisputeUpdate(userId, event.dispute, event.providerEventId, receiptSource);
      } else {
        await this.applyHoldUpdate(userId, event.hold, event.providerEventId, event.type, receiptSource);
      }

      if (event.rawEventId) {
        await this.updateRawEventSuccess(event.rawEventId, event.occurredAt, userId);
      }
    } catch (error) {
      if (event.rawEventId) {
        const message = error instanceof Error ? error.message : 'Spend power event processing failed';
        await this.updateRawEventError(event.rawEventId, message);
      }
      throw error;
    }

    return { userId };
  }
}
