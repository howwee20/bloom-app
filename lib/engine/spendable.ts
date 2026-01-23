import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { LedgerService } from './ledger';

type FlipPayment = {
  id: string;
  title: string;
  time_label: string;
  amount_cents: number;
};

type FlipHolding = {
  label: string;
  amount_cents: number;
  kind: string;
};

type FlipPayload = {
  payments: FlipPayment[];
  holdings: FlipHolding[];
  other_assets: { label: string; amount_cents: number }[];
  liabilities: { label: string; amount_cents: number }[];
};

export class SpendableEngine {
  private ledger = new LedgerService();

  async computeSpendableNow(userId: string) {
    const cashBalance = await this.ledger.getUserCashBalanceCents(userId);

    const { data: holds, error: holdsError } = await supabaseAdmin
      .from('card_holds')
      .select('amount_cents')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (holdsError) throw holdsError;

    const activeHolds = (holds || []).reduce((sum, hold) => sum + hold.amount_cents, 0);

    const { data: policy } = await supabaseAdmin
      .from('policy')
      .select('buffer_cents, buffer_percent')
      .eq('user_id', userId)
      .maybeSingle();

    const bufferFromPercent = policy?.buffer_percent
      ? Math.round(cashBalance * Number(policy.buffer_percent))
      : 0;
    const bufferCents = policy?.buffer_cents ?? bufferFromPercent ?? 0;

    const spendable = cashBalance - activeHolds - bufferCents;

    return {
      spendable_cents: spendable,
      cash_balance_cents: cashBalance,
      active_holds_cents: activeHolds,
      buffer_cents: bufferCents,
    };
  }

  async computeFlip(userId: string): Promise<FlipPayload> {
    const { data: receipts, error: receiptsError } = await supabaseAdmin
      .from('receipts')
      .select('id, title, subtitle, amount_cents, occurred_at')
      .eq('user_id', userId)
      .order('occurred_at', { ascending: false })
      .limit(6);

    if (receiptsError) throw receiptsError;

    const payments: FlipPayment[] = (receipts || []).map((receipt) => ({
      id: receipt.id,
      title: receipt.title,
      time_label: new Date(receipt.occurred_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      amount_cents: receipt.amount_cents,
    }));

    const cashBalance = await this.ledger.getUserCashBalanceCents(userId);

    const { data: positions, error: positionsError } = await supabaseAdmin
      .from('positions')
      .select('qty, cost_basis_cents, instruments(type)')
      .eq('user_id', userId);

    if (positionsError) throw positionsError;

    const totals = {
      stocks: 0,
      crypto: 0,
    };

    (positions || []).forEach((pos) => {
      const type = pos.instruments?.type ?? 'ETF';
      const value = pos.cost_basis_cents ?? 0;
      if (type === 'CRYPTO') {
        totals.crypto += value;
      } else {
        totals.stocks += value;
      }
    });

    const holdings: FlipHolding[] = [
      { label: 'Cash', amount_cents: cashBalance, kind: 'cash' },
      { label: 'Stocks', amount_cents: totals.stocks, kind: 'stocks' },
      { label: 'BTC', amount_cents: totals.crypto, kind: 'btc' },
    ];

    const other_assets = [
      { label: '401(k)', amount_cents: 6420000 },
      { label: 'IRA', amount_cents: 2245000 },
      { label: 'Home Equity', amount_cents: 12800000 },
    ];

    const liabilities = [
      { label: 'Mortgage', amount_cents: -31200000 },
      { label: 'Student Loan', amount_cents: -1840000 },
    ];

    return {
      payments,
      holdings,
      other_assets,
      liabilities,
    };
  }
}

export type { FlipPayload };
