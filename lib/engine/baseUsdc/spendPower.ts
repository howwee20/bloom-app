import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { baseUnitsToCents, normalizeAddress } from '@/providers/base_usdc/normalize';
import { BaseUsdcRpcClient } from '@/providers/base_usdc/rpc';
import { markRpcFailure, upsertRpcHealth, type RpcHealthStatus } from '@/providers/base_usdc/health';

export type SpendPowerBreakdown = {
  confirmed_balance_cents: number;
  active_reserves_cents: number;
  safety_buffer_cents: number;
  degradation_buffer_cents: number;
  spend_power_cents: number;
};

export type SpendPowerResult = SpendPowerBreakdown & {
  freshness_status: RpcHealthStatus;
  updated_ago_seconds: number | null;
  receipts_preview?: Array<Record<string, unknown>>;
};

function resolveNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max?: number) {
  if (max !== undefined && max > 0) {
    return Math.min(Math.max(value, min), max);
  }
  return Math.max(value, min);
}

export class BaseUsdcSpendPowerEngine {
  private rpc: BaseUsdcRpcClient;

  constructor(rpc?: BaseUsdcRpcClient) {
    this.rpc = rpc || new BaseUsdcRpcClient();
  }

  private async getWalletAddress(userId: string) {
    const { data, error } = await supabaseAdmin
      .from('wallets')
      .select('address')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    if (!data?.address) return null;
    return normalizeAddress(data.address);
  }

  private computeSafetyBuffer(balanceCents: number) {
    const bps = resolveNumber('SAFETY_BUFFER_BPS', 0);
    const floor = resolveNumber('BUFFER_FLOOR_CENTS', 0);
    const cap = resolveNumber('BUFFER_CAP_CENTS', 0);
    const fromBps = Math.floor(Math.max(0, balanceCents) * (bps / 10_000));
    return clamp(fromBps, floor, cap > 0 ? cap : undefined);
  }

  private computeDegradationBuffer(balanceCents: number, status: RpcHealthStatus) {
    if (status === 'fresh') return 0;
    const bps = resolveNumber('DEGRADATION_BUFFER_BPS', 0);
    if (bps <= 0) return 0;
    return Math.floor(Math.max(0, balanceCents) * (bps / 10_000));
  }

  private async getActiveReserves(userId: string) {
    const { data, error } = await supabaseAdmin
      .from('reserves')
      .select('amount_cents')
      .eq('user_id', userId)
      .eq('status', 'active');
    if (error) throw error;
    return (data || []).reduce((sum, row) => sum + Number(row.amount_cents || 0), 0);
  }

  private async loadRpcHealth(providerName: string) {
    const { data, error } = await supabaseAdmin
      .from('rpc_health')
      .select('status, last_ok_at')
      .eq('provider_name', providerName)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async calculateSpendPower(userId: string, options?: { includeReceipts?: boolean }):
    Promise<SpendPowerResult> {
    const walletAddress = await this.getWalletAddress(userId);
    if (!walletAddress) {
      return {
        confirmed_balance_cents: 0,
        active_reserves_cents: 0,
        safety_buffer_cents: 0,
        degradation_buffer_cents: 0,
        spend_power_cents: 0,
        freshness_status: 'unknown',
        updated_ago_seconds: null,
        receipts_preview: [],
      };
    }

    let head;
    try {
      head = await this.rpc.getHead();
      await upsertRpcHealth('base_usdc', head.blockTime, head.blockNumber);
    } catch (error) {
      await markRpcFailure('base_usdc');
      throw error;
    }

    const balanceBaseUnits = await this.rpc.getBalanceOfUSDC(walletAddress);
    const confirmedBalance = Number(baseUnitsToCents(balanceBaseUnits));
    const activeReserves = await this.getActiveReserves(userId);

    const rpcHealth = await this.loadRpcHealth('base_usdc');
    const freshnessStatus = (rpcHealth?.status as RpcHealthStatus) || 'unknown';

    const safetyBuffer = this.computeSafetyBuffer(confirmedBalance);
    const degradationBuffer = this.computeDegradationBuffer(confirmedBalance, freshnessStatus);
    const rawSpendPower = confirmedBalance - activeReserves - safetyBuffer - degradationBuffer;
    const spendPower = Math.max(0, rawSpendPower);

    await supabaseAdmin
      .from('spend_power_snapshots')
      .upsert({
        user_id: userId,
        confirmed_balance_cents: confirmedBalance,
        active_reserves_cents: activeReserves,
        safety_buffer_cents: safetyBuffer,
        degradation_buffer_cents: degradationBuffer,
        spend_power_cents: spendPower,
        freshness_status: freshnessStatus,
        computed_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    let receiptsPreview: Array<Record<string, unknown>> | undefined;
    if (options?.includeReceipts) {
      const { data, error } = await supabaseAdmin
        .from('receipts')
        .select('id, source, tx_hash, what_happened, why_changed, what_happens_next, delta_spend_power_cents, occurred_at')
        .eq('user_id', userId)
        .in('source', ['onchain', 'execution', 'policy'])
        .order('occurred_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      receiptsPreview = data || [];
    }

    let updatedAgoSeconds: number | null = null;
    if (rpcHealth?.last_ok_at) {
      updatedAgoSeconds = Math.max(0, Math.floor((Date.now() - new Date(rpcHealth.last_ok_at).getTime()) / 1000));
    }

    return {
      confirmed_balance_cents: confirmedBalance,
      active_reserves_cents: activeReserves,
      safety_buffer_cents: safetyBuffer,
      degradation_buffer_cents: degradationBuffer,
      spend_power_cents: spendPower,
      freshness_status: freshnessStatus,
      updated_ago_seconds: updatedAgoSeconds,
      receipts_preview: receiptsPreview ?? [],
    };
  }
}
