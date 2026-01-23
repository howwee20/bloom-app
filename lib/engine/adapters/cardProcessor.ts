import { CardService } from '../card';

export type CardAuthWebhook = {
  external_id: string;
  user_id: string;
  merchant_name: string;
  mcc?: string;
  amount_cents: number;
  expires_at?: string;
};

export type CardSettlementWebhook = {
  external_id: string;
  user_id: string;
  merchant_name: string;
  amount_cents: number;
  auth_id?: string | null;
};

export type CardRefundWebhook = {
  external_id: string;
  user_id: string;
  merchant_name: string;
  amount_cents: number;
  auth_id?: string | null;
};

export type CardReversalWebhook = {
  external_id: string;
  user_id: string;
  auth_id: string;
  amount_cents: number;
};

export type CardDisputeWebhook = {
  external_id: string;
  user_id: string;
  auth_id?: string | null;
  amount_cents?: number;
  reason?: string;
};

export interface CardProcessorAdapter {
  issueVirtualCard(userId: string): Promise<{ ok: boolean; card_id: string | null }>;
  handleAuthWebhook(payload: CardAuthWebhook, rawEventId?: string | null): Promise<{ approved: boolean; reason_code: string | null; bridge_cents?: number }>;
  handleSettlementWebhook(payload: CardSettlementWebhook, rawEventId?: string | null): Promise<void>;
  handleRefundWebhook(payload: CardRefundWebhook, rawEventId?: string | null): Promise<void>;
  handleReversalWebhook(payload: CardReversalWebhook, rawEventId?: string | null): Promise<void>;
  handleDisputeWebhook(payload: CardDisputeWebhook, rawEventId?: string | null): Promise<void>;
}

export class MockCardProcessorAdapter implements CardProcessorAdapter {
  private cardService = new CardService();

  async issueVirtualCard() {
    return { ok: true, card_id: 'mock-card' };
  }

  async handleAuthWebhook(payload: CardAuthWebhook, rawEventId?: string | null) {
    return this.cardService.handleAuthRequest(payload, { source: 'card_mock', raw_event_id: rawEventId ?? null });
  }

  async handleSettlementWebhook(payload: CardSettlementWebhook, rawEventId?: string | null) {
    await this.cardService.handleSettlement(payload, { source: 'card_mock', raw_event_id: rawEventId ?? null });
  }

  async handleRefundWebhook(payload: CardRefundWebhook, rawEventId?: string | null) {
    await this.cardService.handleRefund(payload, { source: 'card_mock', raw_event_id: rawEventId ?? null });
  }

  async handleReversalWebhook(payload: CardReversalWebhook, rawEventId?: string | null) {
    await this.cardService.handleReversal(payload, { source: 'card_mock', raw_event_id: rawEventId ?? null });
  }

  async handleDisputeWebhook(payload: CardDisputeWebhook, rawEventId?: string | null) {
    await this.cardService.handleDispute(payload, { source: 'card_mock', raw_event_id: rawEventId ?? null });
  }
}

export class PlaceholderCardProcessorAdapter implements CardProcessorAdapter {
  async issueVirtualCard() {
    if (!process.env.CARD_PROCESSOR_API_KEY) {
      throw new Error('Missing CARD_PROCESSOR_API_KEY');
    }
    return { ok: false, card_id: null };
  }

  async handleAuthWebhook(payload: CardAuthWebhook, rawEventId?: string | null) {
    return new MockCardProcessorAdapter().handleAuthWebhook(payload, rawEventId);
  }

  async handleSettlementWebhook(payload: CardSettlementWebhook, rawEventId?: string | null) {
    return new MockCardProcessorAdapter().handleSettlementWebhook(payload, rawEventId);
  }

  async handleRefundWebhook(payload: CardRefundWebhook, rawEventId?: string | null) {
    return new MockCardProcessorAdapter().handleRefundWebhook(payload, rawEventId);
  }

  async handleReversalWebhook(payload: CardReversalWebhook, rawEventId?: string | null) {
    return new MockCardProcessorAdapter().handleReversalWebhook(payload, rawEventId);
  }

  async handleDisputeWebhook(payload: CardDisputeWebhook, rawEventId?: string | null) {
    return new MockCardProcessorAdapter().handleDisputeWebhook(payload, rawEventId);
  }
}

export function getCardProcessorAdapter() {
  if (process.env.CARD_PROCESSOR_API_KEY) {
    return new PlaceholderCardProcessorAdapter();
  }
  return new MockCardProcessorAdapter();
}
