import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { LedgerService } from '../ledger';
import { ReceiptBuilder } from '../receipts';
import { SpendableEngine } from '../spendable';

export type ColumnAuthPayload = {
  external_id: string;
  user_id: string;
  merchant_name: string;
  mcc?: string;
  amount_cents: number;
  expires_at?: string;
};

export type ColumnTransactionPayload = {
  external_id: string;
  user_id: string;
  merchant_name: string;
  amount_cents: number;
  auth_id?: string;
};

export type ColumnAchPayload = {
  external_id: string;
  user_id: string;
  amount_cents: number;
  direction: 'credit' | 'debit';
};

export function verifyColumnSignature(rawBody: string, signature: string | undefined) {
  const secret = process.env.COLUMN_WEBHOOK_SECRET;
  if (!secret) return true;
  if (!signature) return false;
  const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
}

export class ColumnAdapter {
  private ledger = new LedgerService();
  private receipts = new ReceiptBuilder();
  private spendable = new SpendableEngine();

  async handleAuthRequest(payload: ColumnAuthPayload) {
    const { spendable_cents } = await this.spendable.computeSpendableNow(payload.user_id);
    const approved = spendable_cents >= payload.amount_cents;

    if (approved) {
      await supabaseAdmin
        .from('card_holds')
        .upsert({
          user_id: payload.user_id,
          merchant_name: payload.merchant_name,
          mcc: payload.mcc ?? null,
          amount_cents: payload.amount_cents,
          status: 'active',
          external_auth_id: payload.external_id,
          expires_at: payload.expires_at ?? null,
        }, { onConflict: 'external_auth_id' });

      await this.receipts.recordAuthHold(
        payload.user_id,
        payload.merchant_name,
        payload.amount_cents,
        payload.external_id
      );
    }

    return {
      approved,
      reason_code: approved ? null : 'insufficient_funds',
    };
  }

  async handleTransactionPosted(payload: ColumnTransactionPayload) {
    const amount = Math.abs(payload.amount_cents);
    const isRefund = payload.amount_cents < 0;
    const accounts = await this.ledger.ensureCoreAccounts(payload.user_id);
    await this.ledger.postJournalEntry({
      user_id: payload.user_id,
      external_source: 'column',
      external_id: payload.external_id,
      memo: payload.merchant_name,
      postings: [
        {
          ledger_account_id: accounts.cash.id,
          direction: isRefund ? 'debit' : 'credit',
          amount_cents: amount,
        },
        {
          ledger_account_id: accounts.clearing.id,
          direction: isRefund ? 'credit' : 'debit',
          amount_cents: amount,
        },
      ],
    });

    if (payload.auth_id) {
      await supabaseAdmin
        .from('card_holds')
        .update({ status: 'captured' })
        .eq('external_auth_id', payload.auth_id);
    }

    if (isRefund) {
      await this.receipts.recordReceipt({
        user_id: payload.user_id,
        type: 'refund',
        title: payload.merchant_name,
        subtitle: 'Refund posted',
        amount_cents: amount,
        metadata: {
          external_id: payload.external_id,
          what_happened: 'Refund posted.',
          what_changed: 'Cash balance increased.',
          whats_next: 'Funds are available now.',
        },
      });
    } else {
      await this.receipts.recordSettlement(
        payload.user_id,
        payload.merchant_name,
        amount,
        payload.external_id
      );
    }
  }

  async handleAchEvent(payload: ColumnAchPayload) {
    const accounts = await this.ledger.ensureCoreAccounts(payload.user_id);
    const isCredit = payload.direction === 'credit';
    await this.ledger.postJournalEntry({
      user_id: payload.user_id,
      external_source: 'column_ach',
      external_id: payload.external_id,
      memo: isCredit ? 'ACH deposit' : 'ACH withdrawal',
      postings: [
        {
          ledger_account_id: accounts.cash.id,
          direction: isCredit ? 'debit' : 'credit',
          amount_cents: payload.amount_cents,
        },
        {
          ledger_account_id: accounts.clearing.id,
          direction: isCredit ? 'credit' : 'debit',
          amount_cents: payload.amount_cents,
        },
      ],
    });

    if (isCredit) {
      await this.receipts.recordDeposit(
        payload.user_id,
        payload.amount_cents,
        payload.external_id
      );
    } else {
      await this.receipts.recordReceipt({
        user_id: payload.user_id,
        type: 'transfer',
        title: 'ACH withdrawal',
        subtitle: 'Transfer out',
        amount_cents: -Math.abs(payload.amount_cents),
        metadata: { external_id: payload.external_id },
      });
    }
  }
}
