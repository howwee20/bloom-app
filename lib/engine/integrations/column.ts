import { CardService } from '../card';
import { AchService } from '../ach';
import { LedgerService } from '../ledger';

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
  status?: 'pending' | 'posted' | 'returned';
  occurred_at?: string;
};

export class ColumnAdapter {
  private cardService = new CardService();
  private achService = new AchService();
  private ledger = new LedgerService();

  async createAccount() {
    return { ok: true, provider: 'column', account_id: null };
  }

  async getBalanceTruth(userId: string) {
    const cash = await this.ledger.getUserCashBalanceCents(userId);
    return { cash_balance_cents: cash };
  }

  async handleAuthRequest(payload: ColumnAuthPayload, rawEventId?: string | null) {
    return this.cardService.handleAuthRequest(payload, { source: 'column', raw_event_id: rawEventId ?? null });
  }

  async handleTransactionPosted(payload: ColumnTransactionPayload, rawEventId?: string | null) {
    const isRefund = payload.amount_cents < 0;

    if (isRefund) {
      return this.cardService.handleRefund(
        {
          external_id: payload.external_id,
          user_id: payload.user_id,
          merchant_name: payload.merchant_name,
          amount_cents: Math.abs(payload.amount_cents),
          auth_id: payload.auth_id ?? null,
        },
        { source: 'column', raw_event_id: rawEventId ?? null }
      );
    }

    return this.cardService.handleSettlement(
      {
        external_id: payload.external_id,
        user_id: payload.user_id,
        merchant_name: payload.merchant_name,
        amount_cents: Math.abs(payload.amount_cents),
        auth_id: payload.auth_id ?? null,
      },
      { source: 'column', raw_event_id: rawEventId ?? null }
    );
  }

  async handleAchEvent(payload: ColumnAchPayload, rawEventId?: string | null) {
    return this.achService.handleEvent(
      {
        ...payload,
        status: payload.status ?? 'posted',
      },
      { source: 'column', raw_event_id: rawEventId ?? null }
    );
  }
}
