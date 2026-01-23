import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { getBankAdapter } from './adapters/bank';
import { LedgerService } from './ledger';

export class ReconciliationService {
  private ledger = new LedgerService();
  private bank = getBankAdapter();

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
    }

    return data;
  }
}
