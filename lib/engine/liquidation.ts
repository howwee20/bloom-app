import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { BrokerageAdapter } from './integrations/brokerage';
import { CryptoAdapter } from './integrations/crypto';
import { LedgerService } from './ledger';
import { ReceiptBuilder } from './receipts';
import { SpendableEngine } from './spendable';

const DEFAULT_LIQUIDATION_ORDER = ['cash', 'stocks', 'btc'];

function isMarketOpen(now = new Date()) {
  const tz = 'America/New_York';
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = formatter.formatToParts(now);
  const weekday = parts.find((p) => p.type === 'weekday')?.value || 'Sun';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);

  const dayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
  if (dayIndex === 0 || dayIndex === 6) return false;

  const totalMinutes = hour * 60 + minute;
  const openMinutes = 9 * 60 + 30;
  const closeMinutes = 16 * 60;
  return totalMinutes >= openMinutes && totalMinutes <= closeMinutes;
}

export class LiquidationEngine {
  private ledger = new LedgerService();
  private brokerage = new BrokerageAdapter();
  private crypto = new CryptoAdapter();
  private receipts = new ReceiptBuilder();
  private spendable = new SpendableEngine();

  async enqueueIfNeeded(userId: string) {
    const spendable = await this.spendable.computeSpendableNow(userId);
    const deficit = Math.max(0, spendable.active_holds_cents + spendable.buffer_cents - spendable.cash_balance_cents);
    const bridgeOutstanding = spendable.bridge_outstanding_cents ?? 0;
    const required = Math.max(deficit, bridgeOutstanding);

    if (required <= 0) return null;

    const { data: existing } = await supabaseAdmin
      .from('liquidation_jobs')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'queued')
      .maybeSingle();

    if (existing) return existing;

    const { data, error } = await supabaseAdmin
      .from('liquidation_jobs')
      .insert({
        user_id: userId,
        reason: bridgeOutstanding > 0 ? 'bridge_repay' : 'buffer_deficit',
        required_cents: required,
        status: 'queued',
        metadata: { deficit_cents: deficit, bridge_outstanding_cents: bridgeOutstanding },
      })
      .select('*')
      .single();

    if (error) throw error;
    return data;
  }

  async processQueued(limit = 5) {
    const { data: jobs, error } = await supabaseAdmin
      .from('liquidation_jobs')
      .select('*')
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) throw error;

    for (const job of jobs || []) {
      await this.processJob(job.id);
    }
  }

  async processJob(jobId: string) {
    const { data: job, error } = await supabaseAdmin
      .from('liquidation_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error || !job) throw error;

    await supabaseAdmin
      .from('liquidation_jobs')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', jobId);

    let remaining = Math.max(0, job.required_cents || 0);

    const { data: policy } = await supabaseAdmin
      .from('policy')
      .select('liquidation_order_json')
      .eq('user_id', job.user_id)
      .maybeSingle();

    const order = (policy?.liquidation_order_json as string[] | null) || DEFAULT_LIQUIDATION_ORDER;

    for (const step of order) {
      if (remaining <= 0) break;

      if (step === 'stocks') {
        if (!isMarketOpen()) {
          await this.receipts.recordReceipt({
            user_id: job.user_id,
            type: 'liquidation_queued',
            title: 'Liquidation queued',
            subtitle: 'Market closed',
            amount_cents: remaining,
            metadata: {
              what_happened: 'Equity liquidation queued for market open.',
              what_changed: 'No immediate sale executed.',
              whats_next: 'We will sell at next open.',
            },
          });
          break;
        }

        const { data: positions } = await supabaseAdmin
          .from('positions')
          .select('qty, cost_basis_cents, instruments(symbol, type)')
          .eq('user_id', job.user_id);

        const equity = (positions || []).find((pos) => pos.instruments?.type !== 'CRYPTO');
        if (!equity) continue;

        const symbol = equity.instruments?.symbol || process.env.BLOOM_DEFAULT_ETF_SYMBOL || 'SPY';
        const available = Math.max(0, Number(equity.cost_basis_cents || 0));
        const notional = Math.min(remaining, available);
        if (notional <= 0) continue;

        const orderRecord = await this.brokerage.placeOrder({
          user_id: job.user_id,
          symbol,
          side: 'sell',
          notional_cents: notional,
          idempotency_key: `liq-${job.id}-${symbol}`,
        });
        await this.brokerage.fillOrder(orderRecord);
        remaining -= notional;
      }

      if (step === 'btc') {
        const { data: positions } = await supabaseAdmin
          .from('positions')
          .select('qty, cost_basis_cents, instruments(symbol, type)')
          .eq('user_id', job.user_id);

        const btc = (positions || []).find((pos) => pos.instruments?.type === 'CRYPTO');
        if (!btc) continue;

        const symbol = btc.instruments?.symbol || 'BTC';
        const available = Math.max(0, Number(btc.cost_basis_cents || 0));
        const notional = Math.min(remaining, available);
        if (notional <= 0) continue;

        const orderRecord = await this.crypto.placeOrder({
          user_id: job.user_id,
          symbol,
          side: 'sell',
          notional_cents: notional,
          idempotency_key: `liq-${job.id}-${symbol}`,
        });
        await this.crypto.fillOrder(orderRecord);
        remaining -= notional;
      }
    }

    const finalStatus = remaining <= 0 ? 'completed' : 'queued';
    await supabaseAdmin
      .from('liquidation_jobs')
      .update({
        status: finalStatus,
        required_cents: remaining,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    if (finalStatus === 'completed') {
      await this.receipts.recordReceipt({
        user_id: job.user_id,
        type: 'liquidation_completed',
        title: 'Liquidation complete',
        subtitle: 'Balance restored',
        amount_cents: job.required_cents,
        metadata: {
          what_happened: 'Liquidation executed.',
          what_changed: 'Cash balance increased.',
          whats_next: 'Spendable restored.',
        },
      });
    }
  }
}
