import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { LedgerService } from '../ledger';
import { ReceiptBuilder } from '../receipts';

type PlaceOrderInput = {
  user_id: string;
  symbol: string;
  side: 'buy' | 'sell';
  notional_cents: number;
  idempotency_key: string;
};

type OrderRecord = {
  id: string;
  user_id: string;
  instrument_id: string;
  side: 'buy' | 'sell';
  notional_cents: number;
  status: string;
  external_order_id?: string | null;
};

export class CryptoAdapter {
  private ledger = new LedgerService();
  private receipts = new ReceiptBuilder();

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
        type: 'CRYPTO',
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

    const { data, error } = await supabaseAdmin
      .from('orders')
      .insert({
        user_id: input.user_id,
        instrument_id: instrument.id,
        side: input.side,
        notional_cents: input.notional_cents,
        status: 'submitted',
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
      .update({ status: 'filled' })
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
      external_source: 'crypto',
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
  }
}
