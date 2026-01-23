import { randomUUID } from 'crypto';
import { ReceiptBuilder } from './receipts';
import type { CommandConfirmRequest, CommandPreview } from './types';
import { BrokerageAdapter } from './integrations/brokerage';
import { CryptoAdapter } from './integrations/crypto';
import { SpendableEngine } from './spendable';

export class CommandService {
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

    const transferMatch = trimmed.match(/transfer\s+\$?([\d,.]+)/i);
    if (transferMatch) {
      const notional = Math.round(parseFloat(transferMatch[1].replace(/,/g, '')) * 100);
      return {
        action: 'transfer',
        notional_cents: notional,
        preview_title: 'Transfer',
        preview_body: `$${(notional / 100).toFixed(2)} transfer request`,
        confirm_required: true,
        idempotency_key: idempotencyKey,
      };
    }

    const convertMatch = trimmed.match(/convert\s+\$?([\d,.]+)\s+([a-zA-Z]+)\s+to\s+([a-zA-Z]+)/i);
    if (convertMatch) {
      const notional = Math.round(parseFloat(convertMatch[1].replace(/,/g, '')) * 100);
      const fromAsset = convertMatch[2].toUpperCase();
      const toAsset = convertMatch[3].toUpperCase();
      return {
        action: 'convert',
        symbol: fromAsset,
        notional_cents: notional,
        preview_title: `Convert ${fromAsset} to ${toAsset}`,
        preview_body: `$${(notional / 100).toFixed(2)} conversion`,
        confirm_required: true,
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

    if (payload.action === 'transfer') {
      await this.receipts.recordReceipt({
        user_id: userId,
        type: 'transfer_request',
        title: 'Transfer requested',
        subtitle: 'Awaiting processing',
        amount_cents: payload.notional_cents ?? 0,
        metadata: {
          idempotency_key: payload.idempotency_key,
          what_happened: 'Transfer request created.',
          what_changed: 'No balance change yet.',
          whats_next: 'Funds will move when processed.',
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

    if (payload.action === 'convert') {
      const targetSymbol = isCrypto
        ? (process.env.BLOOM_DEFAULT_ETF_SYMBOL || 'SPY')
        : 'BTC';
      const adapter = isCrypto ? this.crypto : this.brokerage;
      const order = await adapter.placeOrder({
        user_id: userId,
        symbol,
        side: 'sell',
        notional_cents: notional,
        idempotency_key: payload.idempotency_key,
      });

      await adapter.fillOrder(order);

      await this.receipts.recordReceipt({
        user_id: userId,
        type: 'convert',
        title: `Converted ${symbol} to ${targetSymbol}`,
        subtitle: 'Conversion executed',
        amount_cents: notional,
        metadata: {
          idempotency_key: payload.idempotency_key,
          what_happened: 'Conversion filled.',
          what_changed: `${symbol} reduced, ${targetSymbol} increased.`,
          whats_next: 'Holdings updated.',
        },
      });

      return { ok: true, order_id: order.id };
    }

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
