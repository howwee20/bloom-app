import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { BaseUsdcReceiptService } from './baseUsdc/receipts';

type NormalizedEventRow = {
  id: string;
  source: string;
  event_type: string;
  external_id: string;
  user_id: string | null;
  status: string | null;
  amount_cents: number | null;
  occurred_at: string;
  metadata: Record<string, unknown> | null;
};

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function getMetadata(event: NormalizedEventRow) {
  return (event.metadata || {}) as Record<string, unknown>;
}

function extractIntentAmount(intent: unknown) {
  if (!intent || typeof intent !== 'object') return 0;
  const raw = (intent as { amount_cents?: number | string }).amount_cents;
  return asNumber(raw, 0);
}

export class BaseUsdcKernel {
  private receipts = new BaseUsdcReceiptService();

  private async handleFundsIn(event: NormalizedEventRow) {
    if (!event.user_id) return;
    const amount = asNumber(event.amount_cents, 0);
    const metadata = getMetadata(event);
    const txHash = metadata.tx_hash ? String(metadata.tx_hash) : null;

    await this.receipts.recordReceipt({
      userId: event.user_id,
      source: 'onchain',
      type: 'onchain_in',
      title: 'USDC received',
      subtitle: 'Transfer confirmed',
      amountCents: amount,
      occurredAt: event.occurred_at,
      txHash,
      providerEventId: `${event.external_id}:in`,
      deltaSpendPowerCents: amount,
      whatHappened: 'USDC transfer in confirmed.',
      whyChanged: 'Onchain balance increased.',
      whatHappensNext: 'Funds are available now.',
      metadata,
    });
  }

  private async handleFundsOut(event: NormalizedEventRow) {
    if (!event.user_id) return;
    const amount = asNumber(event.amount_cents, 0);
    const metadata = getMetadata(event);
    const txHash = metadata.tx_hash ? String(metadata.tx_hash) : null;

    await this.receipts.recordReceipt({
      userId: event.user_id,
      source: 'onchain',
      type: 'onchain_out',
      title: 'USDC sent',
      subtitle: 'Transfer confirmed',
      amountCents: amount,
      occurredAt: event.occurred_at,
      txHash,
      providerEventId: `${event.external_id}:out`,
      deltaSpendPowerCents: -amount,
      whatHappened: 'USDC transfer out confirmed.',
      whyChanged: 'Onchain balance decreased.',
      whatHappensNext: 'Transfer is finalized.',
      metadata,
    });
  }

  private async updateExecution(execId: string, updates: Record<string, unknown>) {
    await supabaseAdmin
      .from('executions')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('exec_id', execId);
  }

  private async releaseReserves(userId: string, quoteId: string | null, status: 'released' | 'canceled') {
    if (!quoteId) return [] as Array<{ reserve_id: string; amount_cents: number }>;

    const { data, error } = await supabaseAdmin
      .from('reserves')
      .select('reserve_id, amount_cents, status')
      .eq('user_id', userId)
      .eq('external_ref', quoteId)
      .eq('status', 'active');

    if (error) throw error;
    const reserves = data || [];
    if (!reserves.length) return [];

    await supabaseAdmin
      .from('reserves')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('external_ref', quoteId)
      .eq('status', 'active');

    return reserves.map((reserve) => ({
      reserve_id: reserve.reserve_id,
      amount_cents: Number(reserve.amount_cents || 0),
    }));
  }

  private async resolveQuoteAmount(quoteId: string | null) {
    if (!quoteId) return 0;
    const { data, error } = await supabaseAdmin
      .from('quotes')
      .select('intent_json')
      .eq('quote_id', quoteId)
      .maybeSingle();
    if (error) throw error;
    return extractIntentAmount(data?.intent_json);
  }

  private async handleTxConfirmed(event: NormalizedEventRow) {
    const execId = event.external_id;
    const metadata = getMetadata(event);
    const txHash = metadata.tx_hash ? String(metadata.tx_hash) : null;

    const { data: execution, error } = await supabaseAdmin
      .from('executions')
      .select('*')
      .eq('exec_id', execId)
      .maybeSingle();
    if (error) throw error;
    if (!execution) return;
    if (execution.status === 'confirmed') return;

    await this.updateExecution(execId, { status: 'confirmed', tx_hash: txHash ?? execution.tx_hash });

    const reserveUpdates = await this.releaseReserves(execution.user_id, execution.quote_id, 'released');
    for (const reserve of reserveUpdates) {
      await this.receipts.recordReceipt({
        userId: execution.user_id,
        source: 'execution',
        type: 'reserve_released',
        title: 'Reserve released',
        subtitle: 'Execution confirmed',
        amountCents: reserve.amount_cents,
        occurredAt: event.occurred_at,
        providerEventId: `${reserve.reserve_id}:released`,
        deltaSpendPowerCents: reserve.amount_cents,
        whatHappened: 'Reserve released after confirmation.',
        whyChanged: 'Execution finalized onchain.',
        whatHappensNext: 'Spend power restored.',
        metadata: { quote_id: execution.quote_id },
      });
    }

    const intentAmount = await this.resolveQuoteAmount(execution.quote_id);
    await this.receipts.recordReceipt({
      userId: execution.user_id,
      source: 'execution',
      type: 'execution_confirmed',
      title: 'Execution confirmed',
      subtitle: 'USDC transfer finalized',
      amountCents: intentAmount,
      occurredAt: event.occurred_at,
      txHash,
      providerEventId: `${execId}:confirmed`,
      deltaSpendPowerCents: 0,
      whatHappened: 'Execution confirmed onchain.',
      whyChanged: 'Transfer included in a confirmed block.',
      whatHappensNext: 'Receipts updated with confirmations.',
      metadata,
    });
  }

  private async handleTxFailed(event: NormalizedEventRow) {
    const execId = event.external_id;
    const metadata = getMetadata(event);
    const txHash = metadata.tx_hash ? String(metadata.tx_hash) : null;

    const { data: execution, error } = await supabaseAdmin
      .from('executions')
      .select('*')
      .eq('exec_id', execId)
      .maybeSingle();
    if (error) throw error;
    if (!execution) return;
    if (execution.status === 'failed') return;

    await this.updateExecution(execId, { status: 'failed', failure_reason: 'onchain_failed', tx_hash: txHash ?? execution.tx_hash });

    const reserveUpdates = await this.releaseReserves(execution.user_id, execution.quote_id, 'canceled');
    for (const reserve of reserveUpdates) {
      await this.receipts.recordReceipt({
        userId: execution.user_id,
        source: 'execution',
        type: 'reserve_canceled',
        title: 'Reserve canceled',
        subtitle: 'Execution failed',
        amountCents: reserve.amount_cents,
        occurredAt: event.occurred_at,
        providerEventId: `${reserve.reserve_id}:canceled`,
        deltaSpendPowerCents: reserve.amount_cents,
        whatHappened: 'Reserve canceled after failure.',
        whyChanged: 'Execution failed onchain.',
        whatHappensNext: 'Spend power restored.',
        metadata: { quote_id: execution.quote_id },
      });
    }

    const intentAmount = await this.resolveQuoteAmount(execution.quote_id);
    await this.receipts.recordReceipt({
      userId: execution.user_id,
      source: 'execution',
      type: 'execution_failed',
      title: 'Execution failed',
      subtitle: 'USDC transfer failed',
      amountCents: intentAmount,
      occurredAt: event.occurred_at,
      txHash,
      providerEventId: `${execId}:failed`,
      deltaSpendPowerCents: 0,
      whatHappened: 'Execution failed onchain.',
      whyChanged: 'Transaction reverted.',
      whatHappensNext: 'No funds moved.',
      metadata,
    });
  }

  async processNormalizedEvent(event: NormalizedEventRow) {
    if (!event?.event_type) return;
    if (event.event_type === 'FUNDS_IN') {
      await this.handleFundsIn(event);
      return;
    }
    if (event.event_type === 'FUNDS_OUT') {
      await this.handleFundsOut(event);
      return;
    }
    if (event.event_type === 'TX_CONFIRMED') {
      await this.handleTxConfirmed(event);
      return;
    }
    if (event.event_type === 'TX_FAILED') {
      await this.handleTxFailed(event);
    }
  }
}
