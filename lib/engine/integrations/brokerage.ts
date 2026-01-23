import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { EventStore } from '../eventStore';
import { LedgerService } from '../ledger';
import { ReceiptBuilder } from '../receipts';

type PlaceOrderInput = {
  user_id: string;
  symbol: string;
  side: 'buy' | 'sell';
  notional_cents: number;
  idempotency_key: string;
};

type AlpacaConfig = {
  key: string;
  secret: string;
  baseUrl: string;
  dataUrl: string;
};

function resolveAlpacaConfig(): AlpacaConfig | null {
  const key = process.env.ALPACA_API_KEY || process.env.ALPACA_KEY;
  const secret = process.env.ALPACA_SECRET_KEY || process.env.ALPACA_SECRET;
  if (!key || !secret) return null;
  return {
    key,
    secret,
    baseUrl: process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets',
    dataUrl: process.env.ALPACA_DATA_URL || 'https://data.alpaca.markets',
  };
}

export type OrderRecord = {
  id: string;
  user_id: string;
  instrument_id: string;
  side: 'buy' | 'sell';
  notional_cents: number;
  status: string;
  external_order_id?: string | null;
};

export type Quote = { symbol: string; price_cents: number; as_of: string };
export type BrokeragePosition = {
  symbol: string;
  qty: number;
  market_value_cents: number;
  cost_basis_cents: number;
};

export interface BrokerageAdapterContract {
  placeOrder(input: PlaceOrderInput): Promise<OrderRecord>;
  fillOrder(order: OrderRecord): Promise<void>;
  getQuote(symbol: string): Promise<Quote>;
  getPositions(userId: string): Promise<BrokeragePosition[]>;
}

export class PaperBrokerageAdapter implements BrokerageAdapterContract {
  private ledger = new LedgerService();
  private receipts = new ReceiptBuilder();
  private eventStore = new EventStore();

  async ensureInstrument(symbol: string) {
    const { data: existing } = await supabaseAdmin
      .from('instruments')
      .select('id, symbol, type')
      .eq('symbol', symbol)
      .maybeSingle();

    if (existing) return existing;

    const { data, error } = await supabaseAdmin
      .from('instruments')
      .insert({
        symbol,
        type: 'ETF',
        quote_source: 'sandbox',
      })
      .select('id, symbol, type')
      .single();

    if (error) throw error;
    return data;
  }

  async placeOrder(input: PlaceOrderInput): Promise<OrderRecord> {
    const instrument = await this.ensureInstrument(input.symbol);

    const { data: existing } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('external_order_id', input.idempotency_key)
      .maybeSingle();

    if (existing) return existing as OrderRecord;

    await this.eventStore.recordNormalizedEvent({
      source: 'brokerage',
      domain: 'trade',
      event_type: 'order_placed',
      external_id: input.idempotency_key,
      user_id: input.user_id,
      status: 'placed',
      amount_cents: input.notional_cents,
      metadata: { symbol: input.symbol, side: input.side },
    });

    const { data, error } = await supabaseAdmin
      .from('orders')
      .insert({
        user_id: input.user_id,
        instrument_id: instrument.id,
        side: input.side,
        notional_cents: input.notional_cents,
        status: 'placed',
        external_order_id: input.idempotency_key,
      })
      .select('*')
      .single();

    if (error) throw error;
    return data as OrderRecord;
  }

  async fillOrder(order: OrderRecord) {
    await supabaseAdmin
      .from('orders')
      .update({ status: 'filled', filled_cents: Math.abs(order.notional_cents), updated_at: new Date().toISOString() })
      .eq('id', order.id);

    const instrument = await supabaseAdmin
      .from('instruments')
      .select('id, symbol')
      .eq('id', order.instrument_id)
      .single();

    if (instrument.error || !instrument.data) {
      throw instrument.error;
    }

    const { data: position } = await supabaseAdmin
      .from('positions')
      .select('*')
      .eq('user_id', order.user_id)
      .eq('instrument_id', order.instrument_id)
      .maybeSingle();

    const qtyDelta = order.side === 'buy' ? 1 : -1;
    const costDelta = order.side === 'buy' ? order.notional_cents : -order.notional_cents;

    if (position) {
      await supabaseAdmin
        .from('positions')
        .update({
          qty: Number(position.qty) + qtyDelta,
          cost_basis_cents: Number(position.cost_basis_cents) + costDelta,
          updated_at: new Date().toISOString(),
        })
        .eq('id', position.id);
    } else {
      await supabaseAdmin
        .from('positions')
        .insert({
          user_id: order.user_id,
          instrument_id: order.instrument_id,
          qty: qtyDelta,
          cost_basis_cents: order.notional_cents,
        });
    }

    const accounts = await this.ledger.ensureCoreAccounts(order.user_id);
    await this.ledger.postJournalEntry({
      user_id: order.user_id,
      external_source: 'brokerage',
      external_id: order.external_order_id || order.id,
      memo: `${order.side} ${instrument.data.symbol}`,
      postings: [
        {
          ledger_account_id: accounts.cash.id,
          direction: order.side === 'buy' ? 'credit' : 'debit',
          amount_cents: Math.abs(order.notional_cents),
        },
        {
          ledger_account_id: accounts.clearing.id,
          direction: order.side === 'buy' ? 'debit' : 'credit',
          amount_cents: Math.abs(order.notional_cents),
        },
      ],
    });

    await this.receipts.recordTradeFill(
      order.user_id,
      instrument.data.symbol,
      Math.abs(order.notional_cents),
      order.side,
      order.external_order_id || order.id
    );

    await this.eventStore.recordNormalizedEvent({
      source: 'brokerage',
      domain: 'trade',
      event_type: 'order_filled',
      external_id: order.external_order_id || order.id,
      user_id: order.user_id,
      status: 'filled',
      amount_cents: Math.abs(order.notional_cents),
      metadata: { symbol: instrument.data.symbol, side: order.side },
    });
  }

  async getPositions(userId: string): Promise<BrokeragePosition[]> {
    const { data, error } = await supabaseAdmin
      .from('positions')
      .select('qty, cost_basis_cents, instruments(symbol)')
      .eq('user_id', userId);

    if (error) throw error;

    return (data || []).map((row) => ({
      symbol: row.instruments?.symbol || 'UNKNOWN',
      qty: Number(row.qty || 0),
      market_value_cents: Number(row.cost_basis_cents || 0),
      cost_basis_cents: Number(row.cost_basis_cents || 0),
    }));
  }

  async getQuote(symbol: string): Promise<Quote> {
    const price_cents = symbol === 'SPY' ? 50000 : 10000;
    return { symbol, price_cents, as_of: new Date().toISOString() };
  }
}

export class AlpacaBrokerageAdapter implements BrokerageAdapterContract {
  async placeOrder(input: PlaceOrderInput): Promise<OrderRecord> {
    if (!process.env.ALPACA_API_KEY || !process.env.ALPACA_SECRET_KEY) {
      throw new Error('Missing ALPACA_API_KEY or ALPACA_SECRET_KEY');
    }
    return new PaperBrokerageAdapter().placeOrder(input);
  }

  async fillOrder(order: OrderRecord) {
    return new PaperBrokerageAdapter().fillOrder(order);
  }

  async getQuote(symbol: string): Promise<Quote> {
    return new PaperBrokerageAdapter().getQuote(symbol);
  }
}

export class BrokerageAdapter implements BrokerageAdapterContract {
  private impl: BrokerageAdapterContract;

  constructor() {
    this.impl = process.env.ALPACA_API_KEY ? new AlpacaBrokerageAdapter() : new PaperBrokerageAdapter();
  }

  placeOrder(input: PlaceOrderInput) {
    return this.impl.placeOrder(input);
  }

  fillOrder(order: OrderRecord) {
    return this.impl.fillOrder(order);
  }

  getQuote(symbol: string) {
    return this.impl.getQuote(symbol);
  }
}
