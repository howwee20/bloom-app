import { randomUUID } from 'crypto';
import { ReceiptBuilder } from './receipts';
import type { CommandConfirmRequest, CommandPreview } from './types';
import { BrokerageAdapter } from './integrations/brokerage';
import { CryptoAdapter } from './integrations/crypto';
import { SpendableEngine } from './spendable';
import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { AccountService } from './account';

export class CommandService {
  private receipts = new ReceiptBuilder();
  private spendable = new SpendableEngine();
  private brokerage = new BrokerageAdapter();
  private crypto = new CryptoAdapter();
  private account = new AccountService();

  private async upsertPolicy(userId: string, updates: Record<string, unknown>) {
    const { data, error } = await supabaseAdmin
      .from('policy')
      .upsert({ user_id: userId, ...updates }, { onConflict: 'user_id' })
      .select('*')
      .single();

    if (error) throw error;
    return data;
  }

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

    if (lower.includes('direct deposit') || lower.includes('dd details') || lower === 'dd' || lower.includes('routing')) {
      return {
        action: 'dd_details',
        preview_title: 'Direct deposit details',
        preview_body: 'Fetching routing and account info.',
        confirm_required: false,
        idempotency_key: idempotencyKey,
      };
    }

    if (lower.includes('card status')) {
      return {
        action: 'card_status',
        preview_title: 'Card status',
        preview_body: 'Fetching card status.',
        confirm_required: false,
        idempotency_key: idempotencyKey,
      };
    }

    if (lower.includes('freeze card')) {
      return {
        action: 'card_freeze',
        preview_title: 'Freeze card',
        preview_body: 'Freeze this card until you unfreeze it.',
        confirm_required: true,
        idempotency_key: idempotencyKey,
      };
    }

    if (lower.includes('unfreeze card')) {
      return {
        action: 'card_unfreeze',
        preview_title: 'Unfreeze card',
        preview_body: 'Unfreeze this card.',
        confirm_required: true,
        idempotency_key: idempotencyKey,
      };
    }

    const bufferMatch = trimmed.match(/set\s+buffer\s+\$?([\d,.]+)/i);
    if (bufferMatch) {
      const notional = Math.round(parseFloat(bufferMatch[1].replace(/,/g, '')) * 100);
      return {
        action: 'set_buffer',
        notional_cents: notional,
        preview_title: 'Set buffer',
        preview_body: `$${(notional / 100).toFixed(2)} buffer`,
        confirm_required: true,
        idempotency_key: idempotencyKey,
      };
    }

    const allocationMatch = trimmed.match(/allocate\s+(\d+)%\s+stocks?\s+(\d+)%\s+btc/i);
    if (allocationMatch) {
      const stocksPct = Number(allocationMatch[1]);
      const btcPct = Number(allocationMatch[2]);
      return {
        action: 'allocate',
        allocation_targets: { stocks_pct: stocksPct, btc_pct: btcPct },
        preview_title: 'Set allocation',
        preview_body: `${stocksPct}% stocks · ${btcPct}% BTC`,
        confirm_required: true,
        idempotency_key: idempotencyKey,
      };
    }

    if (lower.includes('show holdings') || lower === 'holdings') {
      return {
        action: 'holdings',
        preview_title: 'Holdings',
        preview_body: 'Fetching holdings summary.',
        confirm_required: false,
        idempotency_key: idempotencyKey,
      };
    }

    if (lower.includes('btc quote') || lower === 'quote btc') {
      return {
        action: 'btc_quote',
        preview_title: 'BTC quote',
        preview_body: 'Fetching BTC price.',
        confirm_required: false,
        idempotency_key: idempotencyKey,
      };
    }

    if (lower.includes('stock quote') || lower === 'quote stocks') {
      return {
        action: 'stock_quote',
        preview_title: 'Stocks quote',
        preview_body: 'Fetching stock price.',
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
      const symbolRaw = buyMatch[2].toUpperCase();
      const symbol = symbolRaw === 'STOCKS' || symbolRaw === 'STOCK'
        ? (process.env.BLOOM_STOCK_TICKER || 'SPY')
        : symbolRaw;
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
      const symbolRaw = sellMatch[2].toUpperCase();
      const symbol = symbolRaw === 'STOCKS' || symbolRaw === 'STOCK'
        ? (process.env.BLOOM_STOCK_TICKER || 'SPY')
        : symbolRaw;
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

    if (payload.action === 'dd_details') {
      return this.account.getDirectDepositDetails(userId);
    }

    if (payload.action === 'card_status') {
      return this.account.getCardStatus(userId);
    }

    if (payload.action === 'card_freeze' || payload.action === 'card_unfreeze') {
      await this.receipts.recordReceipt({
        user_id: userId,
        type: payload.action === 'card_freeze' ? 'card_freeze' : 'card_unfreeze',
        title: payload.action === 'card_freeze' ? 'Card freeze requested' : 'Card unfreeze requested',
        subtitle: 'Pending write access',
        amount_cents: 0,
        metadata: {
          what_happened: 'Card control requested.',
          what_changed: 'Awaiting processor write access.',
          whats_next: 'We will apply once enabled.',
        },
      });
      return { ok: true, pending: true };
    }

    if (payload.action === 'set_buffer') {
      if (!payload.notional_cents) throw new Error('Missing buffer amount');
      await this.upsertPolicy(userId, { buffer_cents: payload.notional_cents });
      await this.receipts.recordReceipt({
        user_id: userId,
        type: 'policy_update',
        title: 'Buffer updated',
        subtitle: 'Savings buffer set',
        amount_cents: payload.notional_cents,
        metadata: {
          what_happened: 'Buffer updated.',
          what_changed: 'Spendable policy adjusted.',
          whats_next: 'New buffer applies immediately.',
        },
      });
      return { ok: true };
    }

    if (payload.action === 'allocate') {
      if (!payload.allocation_targets) throw new Error('Missing allocation targets');
      await this.upsertPolicy(userId, { allocation_targets_json: payload.allocation_targets });
      await this.receipts.recordReceipt({
        user_id: userId,
        type: 'allocation_set',
        title: 'Allocation set',
        subtitle: `${payload.allocation_targets.stocks_pct}% stocks · ${payload.allocation_targets.btc_pct}% BTC`,
        amount_cents: 0,
        metadata: {
          what_happened: 'Allocation updated.',
          what_changed: 'Targets stored.',
          whats_next: 'Execute allocation when ready.',
        },
      });
      return { ok: true, allocation_targets: payload.allocation_targets };
    }

    if (payload.action === 'holdings') {
      return this.spendable.computeFlip(userId);
    }

    if (payload.action === 'btc_quote') {
      return this.crypto.getQuote('BTC');
    }

    if (payload.action === 'stock_quote') {
      const symbol = process.env.BLOOM_STOCK_TICKER || 'SPY';
      return this.brokerage.getQuote(symbol);
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
