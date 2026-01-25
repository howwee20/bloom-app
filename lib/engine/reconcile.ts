import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { getBankAdapter } from './adapters/bank';
import { LedgerService } from './ledger';
import { ReceiptBuilder } from './receipts';
import { receiptCatalog } from './receiptCatalog';
import { MetricsService } from './metrics';
import { BrokerageAdapter } from './integrations/brokerage';

export class ReconciliationService {
  private ledger = new LedgerService();
  private bank = getBankAdapter();
  private receipts = new ReceiptBuilder();
  private metrics = new MetricsService();
  private brokerage = new BrokerageAdapter();

  private async retryPendingTrades(userId: string) {
    const { data: pending, error } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending_fill_accounting');

    if (error) throw error;

    for (const order of pending || []) {
      await this.brokerage.fillOrder(order);
    }
  }

  async reconcileUser(userId: string) {
    const partner = await this.bank.getBalanceTruth(userId);
    const ledgerBalance = await this.ledger.getUserCashBalanceCents(userId);
    const drift = partner.cash_balance_cents - ledgerBalance;

    const { count: eventCount } = await supabaseAdmin
      .from('normalized_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    const { data, error } = await supabaseAdmin
      .from('reconciliation_reports')
      .insert({
        user_id: userId,
        partner_balance_cents: partner.cash_balance_cents,
        ledger_balance_cents: ledgerBalance,
        drift_cents: drift,
        event_count: eventCount ?? 0,
        metadata: { source: 'bank' },
      })
      .select('*')
      .single();

    if (error) throw error;

    if (Math.abs(drift) > 0) {
      await supabaseAdmin
        .from('internal_alerts')
        .insert({
          user_id: userId,
          kind: 'reconciliation_drift',
          message: `Drift detected: ${drift} cents`,
          metadata: { partner_balance_cents: partner.cash_balance_cents, ledger_balance_cents: ledgerBalance },
        });

      await this.receipts.recordReceipt({
        user_id: userId,
        ...receiptCatalog.reconcileDrift({
          drift_cents: drift,
          external_id: data.id,
        }),
      });

      await this.metrics.recordCount('reconcile_drift_count', 1, { drift_cents: drift }, userId);
      await this.metrics.record('unexplained_delta_cents', drift, { partner_balance_cents: partner.cash_balance_cents }, userId);
    } else {
      await this.receipts.recordReceipt({
        user_id: userId,
        ...receiptCatalog.reconcileCleared({
          external_id: data.id,
        }),
      });

      await this.metrics.recordCount('reconcile_drift_cleared', 1, {}, userId);
    }

    await this.retryPendingTrades(userId);

    return data;
  }
}
