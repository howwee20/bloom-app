import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { EventStore } from '../eventStore';
import { LedgerService } from '../ledger';
import { ReceiptBuilder } from '../receipts';
import { receiptCatalog } from '../receiptCatalog';

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

  async fillOrder(
    order: OrderRecord,
    fillOverride?: { filled_cents?: number; filled_qty?: number; status?: string }
  ) {
    const filledCents = Math.abs(fillOverride?.filled_cents ?? order.notional_cents);
    const filledQty = Math.abs(fillOverride?.filled_qty ?? 1);
    const status = fillOverride?.status ?? 'filled';

    await supabaseAdmin
      .from('orders')
      .update({
        status,
        filled_cents: filledCents,
        filled_qty: filledQty,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id);

    if (filledCents <= 0 || filledQty <= 0) {
      return;
    }

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

    const qtyDelta = order.side === 'buy' ? filledQty : -filledQty;
    const costDelta = order.side === 'buy' ? filledCents : -filledCents;

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
          cost_basis_cents: filledCents,
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
          amount_cents: filledCents,
        },
        {
          ledger_account_id: accounts.clearing.id,
          direction: order.side === 'buy' ? 'debit' : 'credit',
          amount_cents: filledCents,
        },
      ],
    });

    await this.receipts.recordTradeFill(
      order.user_id,
      instrument.data.symbol,
      filledCents,
      order.side,
      order.external_order_id || order.id
    );

    await this.eventStore.recordNormalizedEvent({
      source: 'brokerage',
      domain: 'trade',
      event_type: 'order_filled',
      external_id: order.external_order_id || order.id,
      user_id: order.user_id,
      status,
      amount_cents: filledCents,
      metadata: { symbol: instrument.data.symbol, side: order.side, filled_qty: filledQty },
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
  private config: AlpacaConfig;
  private eventStore = new EventStore();
  private local = new PaperBrokerageAdapter();
  private receipts = new ReceiptBuilder();

  constructor() {
    const config = resolveAlpacaConfig();
    if (!config) {
      throw new Error('Missing Alpaca API credentials');
    }
    this.config = config;
  }

  private async request<T>(
    path: string,
    method: 'GET' | 'POST' | 'PATCH' = 'GET',
    body?: unknown,
    useDataApi = false
  ): Promise<{ ok: boolean; status: number; data: T }> {
    const baseUrl = useDataApi ? this.config.dataUrl : this.config.baseUrl;
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'APCA-API-KEY-ID': this.config.key,
        'APCA-API-SECRET-KEY': this.config.secret,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await res.text();
    let data: T;
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = text as unknown as T;
    }

    return { ok: res.ok, status: res.status, data };
  }

  private async ensureInstrument(symbol: string) {
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
        quote_source: 'alpaca',
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

    const response = await this.request<{ id: string; status: string }>(
      '/v2/orders',
      'POST',
      {
        symbol: input.symbol,
        notional: (input.notional_cents / 100).toFixed(2),
        side: input.side,
        type: 'market',
        time_in_force: 'day',
        client_order_id: input.idempotency_key,
      }
    );

    if (!response.ok) {
      throw new Error(`Alpaca order failed (${response.status})`);
    }

    await this.eventStore.recordNormalizedEvent({
      source: 'brokerage',
      domain: 'trade',
      event_type: 'order_placed',
      external_id: input.idempotency_key,
      user_id: input.user_id,
      status: response.data.status || 'placed',
      amount_cents: input.notional_cents,
      metadata: { symbol: input.symbol, side: input.side, alpaca_order_id: response.data.id },
    });

    const { data, error } = await supabaseAdmin
      .from('orders')
      .insert({
        user_id: input.user_id,
        instrument_id: instrument.id,
        side: input.side,
        notional_cents: input.notional_cents,
        status: response.data.status || 'placed',
        external_order_id: input.idempotency_key,
      })
      .select('*')
      .single();

    if (error) throw error;
    return data as OrderRecord;
  }

  async fillOrder(order: OrderRecord) {
    if (!order.external_order_id) {
      await this.local.fillOrder(order);
      return;
    }

    const response = await this.request<{ status: string }>(
      `/v2/orders:by_client_order_id?client_order_id=${order.external_order_id}`,
      'GET'
    );

    if (!response.ok) {
      throw new Error(`Alpaca order lookup failed (${response.status})`);
    }

    const status = response.data.status;
    if (status === 'filled' || status === 'partially_filled') {
      const filledQty = Number((response.data as any).filled_qty || 0);
      const filledAvgPrice = Number((response.data as any).filled_avg_price || 0);
      const requestedQty = Number((response.data as any).qty || 0);
      const requestedNotional = Number((response.data as any).notional || 0);

      let filledCents = 0;
      if (filledQty > 0 && filledAvgPrice > 0) {
        filledCents = Math.round(filledQty * filledAvgPrice * 100);
      } else if (filledQty > 0 && requestedQty > 0 && requestedNotional > 0) {
        const fillRatio = Math.min(1, filledQty / requestedQty);
        filledCents = Math.round(requestedNotional * fillRatio * 100);
      }

      if (filledCents <= 0) {
        await supabaseAdmin
          .from('orders')
          .update({ status: 'pending_fill_accounting', updated_at: new Date().toISOString() })
          .eq('id', order.id);

        await this.eventStore.recordNormalizedEvent({
          source: 'brokerage',
          domain: 'trade',
          event_type: 'order_pending_fill',
          external_id: order.external_order_id || order.id,
          user_id: order.user_id,
          status: 'pending_fill_accounting',
          amount_cents: order.notional_cents,
          metadata: { reason: 'missing_fill_fields' },
        });

        const { data: instrument } = await supabaseAdmin
          .from('instruments')
          .select('symbol')
          .eq('id', order.instrument_id)
          .maybeSingle();

        await this.receipts.recordReceipt({
          user_id: order.user_id,
          ...receiptCatalog.tradeQueued({
            symbol: instrument?.symbol || 'Trade',
            amount_cents: 0,
            external_id: order.external_order_id || order.id,
          }),
        });

        await supabaseAdmin
          .from('internal_alerts')
          .insert({
            user_id: order.user_id,
            kind: 'pending_fill_accounting',
            message: `Missing fill data for order ${order.external_order_id || order.id}`,
            metadata: { order_id: order.id, external_order_id: order.external_order_id },
          });

        return;
      }

      await this.local.fillOrder(order, {
        filled_cents: filledCents,
        filled_qty: filledQty > 0 ? filledQty : 1,
        status,
      });
      return;
    }

    await supabaseAdmin
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', order.id);

    const { data: instrument } = await supabaseAdmin
      .from('instruments')
      .select('symbol')
      .eq('id', order.instrument_id)
      .maybeSingle();
    const symbol = instrument?.symbol || 'Trade';
    await this.receipts.recordReceipt({
      user_id: order.user_id,
      ...receiptCatalog.tradeQueued({
        symbol,
        amount_cents: order.notional_cents,
        external_id: order.external_order_id || order.id,
      }),
    });
  }

  async getQuote(symbol: string): Promise<Quote> {
    const response = await this.request<{ bar?: { c?: number }; quote?: { ap?: number; bp?: number } }>(
      `/v2/stocks/${symbol}/bars/latest`,
      'GET',
      undefined,
      true
    );

    if (!response.ok) {
      return this.local.getQuote(symbol);
    }

    const barPrice = response.data.bar?.c;
    const quotePrice = response.data.quote?.ap ?? response.data.quote?.bp;
    const price = barPrice ?? quotePrice;

    if (!price || Number.isNaN(price)) {
      return this.local.getQuote(symbol);
    }

    return { symbol, price_cents: Math.round(price * 100), as_of: new Date().toISOString() };
  }

  async getPositions(_: string): Promise<BrokeragePosition[]> {
    const response = await this.request<Array<{ symbol: string; qty: string; market_value: string; cost_basis: string }>>(
      '/v2/positions'
    );

    if (!response.ok) {
      throw new Error(`Alpaca positions failed (${response.status})`);
    }

    return (response.data || []).map((position) => ({
      symbol: position.symbol,
      qty: Number(position.qty || 0),
      market_value_cents: Math.round(Number(position.market_value || 0) * 100),
      cost_basis_cents: Math.round(Number(position.cost_basis || 0) * 100),
    }));
  }
}

export class BrokerageAdapter implements BrokerageAdapterContract {
  private impl: BrokerageAdapterContract;

  constructor() {
    this.impl = resolveAlpacaConfig() ? new AlpacaBrokerageAdapter() : new PaperBrokerageAdapter();
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

  getPositions(userId: string) {
    return this.impl.getPositions(userId);
  }
}
