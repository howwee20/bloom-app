import { randomUUID } from 'crypto';
import { LedgerService } from './ledger';
import { ReceiptBuilder } from './receipts';
import type { CommandConfirmRequest, CommandPreview } from './types';
import { BrokerageAdapter } from './integrations/brokerage';
import { CryptoAdapter } from './integrations/crypto';
import { SpendableEngine } from './spendable';

export class CommandService {
  private ledger = new LedgerService();
  private receipts = new ReceiptBuilder();
  private spendable = new SpendableEngine();
  private brokerage = new BrokerageAdapter();
  private crypto = new CryptoAdapter();

  parse(text: string): CommandPreview {
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();
    const idempotencyKey = randomUUID();

    if (lower === 'balance' || lower === 'spendable') {
      return {
        action: 'balance',
        preview_title: 'Spendable balance',
        preview_body: 'Fetch your spendable now balance.',
        confirm_required: false,
        idempotency_key: idempotencyKey,
      };
    }

    if (lower === 'breakdown') {
      return {
        action: 'breakdown',
        preview_title: 'Holdings breakdown',
        preview_body: 'Show recent payments + holdings.',
        confirm_required: false,
        idempotency_key: idempotencyKey,
      };
    }

    if (lower.includes('support') || lower.includes('help')) {
      return {
        action: 'support',
        preview_title: 'Support request',
        preview_body: 'We will connect you with Bloom support.',
        confirm_required: false,
        idempotency_key: idempotencyKey,
      };
    }

    const buyMatch = trimmed.match(/buy\s+\$?([\d,.]+)\s+([a-zA-Z]+)/i);
    if (buyMatch) {
      const notional = Math.round(parseFloat(buyMatch[1].replace(/,/g, '')) * 100);
      const symbol = buyMatch[2].toUpperCase();
      return {
        action: 'buy',
        symbol,
        notional_cents: notional,
        preview_title: `Buy ${symbol}`,
        preview_body: `$${(notional / 100).toFixed(2)} notional`,
        confirm_required: true,
        idempotency_key: idempotencyKey,
      };
    }

    const sellMatch = trimmed.match(/sell\s+\$?([\d,.]+)\s+([a-zA-Z]+)/i);
    if (sellMatch) {
      const notional = Math.round(parseFloat(sellMatch[1].replace(/,/g, '')) * 100);
      const symbol = sellMatch[2].toUpperCase();
      return {
        action: 'sell',
        symbol,
        notional_cents: notional,
        preview_title: `Sell ${symbol}`,
        preview_body: `$${(notional / 100).toFixed(2)} notional`,
        confirm_required: true,
        idempotency_key: idempotencyKey,
      };
    }

    return {
      action: 'support',
      preview_title: 'Support request',
      preview_body: 'We can help with transfers, investing, or support.',
      confirm_required: false,
      idempotency_key: idempotencyKey,
    };
  }

  async confirm(userId: string, payload: CommandConfirmRequest) {
    if (payload.action === 'balance') {
      return this.spendable.computeSpendableNow(userId);
    }

    if (payload.action === 'breakdown') {
      return this.spendable.computeFlip(userId);
    }

    if (payload.action === 'support') {
      await this.receipts.recordReceipt({
        user_id: userId,
        type: 'support_request',
        title: 'Support',
        subtitle: 'We will reach out shortly.',
        amount_cents: 0,
        metadata: {
          what_happened: 'Support request opened.',
          what_changed: 'No balance change.',
          whats_next: 'A Bloom specialist will contact you.',
        },
      });
      return { ok: true };
    }

    if (!payload.symbol || !payload.notional_cents) {
      throw new Error('Missing order details');
    }

    const symbol = payload.symbol.toUpperCase();
    const notional = payload.notional_cents;
    const isCrypto = ['BTC', 'ETH', 'SOL'].includes(symbol);
    const adapter = isCrypto ? this.crypto : this.brokerage;

    const order = await adapter.placeOrder({
      user_id: userId,
      symbol,
      side: payload.action,
      notional_cents: notional,
      idempotency_key: payload.idempotency_key,
    });

    await adapter.fillOrder(order);

    return { ok: true, order_id: order.id };
  }
}
