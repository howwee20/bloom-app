import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { ExternalLinkService } from './externalLinks';
import { LedgerService } from './ledger';
import { extractUnitBalanceCents, getUnitAccount, isUnitConfigured } from './integrations/unitClient';

type FreshnessStatus = 'fresh' | 'stale' | 'unknown';

type SpendPowerBreakdown = {
  settled_cash_cents: number;
  active_holds_cents: number;
  active_reserves_cents: number;
  safety_buffer_cents: number;
  degradation_buffer_cents: number;
  spend_power_cents: number;
};

type SpendPowerResult = SpendPowerBreakdown & {
  freshness_status: FreshnessStatus;
  updated_at: string | null;
  updated_age_seconds: number | null;
  flags: {
    degraded: boolean;
    block_high_risk: boolean;
    requires_step_up: boolean;
  };
  receipts_preview?: Array<Record<string, unknown>>;
};

const FEED_NAME = 'unit_webhook';

function resolveThreshold(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function computeFreshnessStatus(ageSeconds: number | null): FreshnessStatus {
  if (ageSeconds === null) return 'unknown';
  const freshMax = resolveThreshold('FRESH_MAX_SECONDS', 60);
  const staleMax = resolveThreshold('STALE_MAX_SECONDS', 300);
  const unknownMax = resolveThreshold('UNKNOWN_MAX_SECONDS', 900);

  if (ageSeconds <= freshMax) return 'fresh';
  if (ageSeconds <= staleMax) return 'stale';
  if (ageSeconds <= unknownMax) return 'unknown';
  return 'unknown';
}

function formatAgeSeconds(ageSeconds: number | null) {
  if (ageSeconds === null) return null;
  return Math.max(0, Math.floor(ageSeconds));
}

export class SpendPowerEngine {
  private externalLinks = new ExternalLinkService();
  private ledger = new LedgerService();

  private async getFeedHealth() {
    const { data, error } = await supabaseAdmin
      .from('feed_health')
      .select('*')
      .eq('feed_name', FEED_NAME)
      .maybeSingle();

    if (error) throw error;
    if (!data?.last_event_received_at) {
      return {
        status: 'unknown' as FreshnessStatus,
        updated_at: null,
        ageSeconds: null,
      };
    }

    const updatedAt = new Date(data.last_event_received_at);
    const ageSeconds = (Date.now() - updatedAt.getTime()) / 1000;
    const status = computeFreshnessStatus(ageSeconds);

    if (status !== data.status) {
      await supabaseAdmin
        .from('feed_health')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('feed_name', FEED_NAME);
    }

    return {
      status,
      updated_at: data.last_event_received_at,
      ageSeconds,
    };
  }

  private async getSettledCashCents(userId: string) {
    const link = await this.externalLinks.getLink(userId, 'unit');
    if (link?.bank_account_id && isUnitConfigured()) {
      const response = await getUnitAccount(link.bank_account_id);
      if (response.ok && response.data?.data?.attributes) {
        const balance = extractUnitBalanceCents(response.data.data.attributes);
        if (balance !== null) {
          return balance;
        }
      }
    }

    return this.ledger.getUserCashBalanceCents(userId);
  }

  private async getSafetyBufferCents(userId: string, settledCashCents: number) {
    const { data, error } = await supabaseAdmin
      .from('policy')
      .select('safety_buffer_cents, buffer_cents, buffer_percent')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    if (data?.safety_buffer_cents != null) {
      return Number(data.safety_buffer_cents) || 0;
    }

    if (data?.buffer_cents != null) {
      return Number(data.buffer_cents) || 0;
    }

    if (data?.buffer_percent != null) {
      return Math.round(Math.max(0, settledCashCents) * Number(data.buffer_percent));
    }

    return Number(process.env.SPEND_POWER_SAFETY_BUFFER_CENTS || 0) || 0;
  }

  private async getDegradationBufferCents(userId: string, status: FreshnessStatus) {
    if (status === 'fresh') return 0;
    const { data, error } = await supabaseAdmin
      .from('policy')
      .select('degradation_buffer_cents')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    if (data?.degradation_buffer_cents != null) {
      return Number(data.degradation_buffer_cents) || 0;
    }
    return Number(process.env.SPEND_POWER_DEGRADATION_BUFFER_CENTS || 0) || 0;
  }

  async calculateSpendPower(userId: string, options?: { includeReceipts?: boolean }): Promise<SpendPowerResult> {
    const feed = await this.getFeedHealth();

    const settledCash = await this.getSettledCashCents(userId);
    const { data: holds, error: holdsError } = await supabaseAdmin
      .from('auth_holds')
      .select('amount_cents')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (holdsError) throw holdsError;
    const activeHolds = (holds || []).reduce((sum, hold) => sum + Number(hold.amount_cents || 0), 0);

    const { data: reserves, error: reservesError } = await supabaseAdmin
      .from('reserves')
      .select('amount_cents')
      .eq('user_id', userId)
      .eq('status', 'active');

    if (reservesError) throw reservesError;
    const activeReserves = (reserves || []).reduce((sum, reserve) => sum + Number(reserve.amount_cents || 0), 0);

    const safetyBuffer = await this.getSafetyBufferCents(userId, settledCash);
    const degradationBuffer = await this.getDegradationBufferCents(userId, feed.status);

    const rawSpendPower = settledCash - activeHolds - activeReserves - safetyBuffer - degradationBuffer;
    const spendPower = Math.max(0, rawSpendPower);

    const snapshot = {
      user_id: userId,
      settled_cash_cents: settledCash,
      active_holds_cents: activeHolds,
      active_reserves_cents: activeReserves,
      safety_buffer_cents: safetyBuffer,
      degradation_buffer_cents: degradationBuffer,
      spend_power_cents: spendPower,
      freshness_status: feed.status,
      computed_at: new Date().toISOString(),
    };

    await supabaseAdmin
      .from('spend_power_snapshots')
      .upsert(snapshot, { onConflict: 'user_id' });

    let receiptsPreview: Array<Record<string, unknown>> | undefined;
    if (options?.includeReceipts) {
      const { data: receipts, error: receiptsError } = await supabaseAdmin
        .from('receipts')
        .select('id, source, provider_event_id, what_happened, why_changed, what_happens_next, delta_spend_power_cents, occurred_at')
        .eq('user_id', userId)
        .in('source', ['unit_event', 'reconcile', 'manual'])
        .order('occurred_at', { ascending: false })
        .limit(5);
      if (receiptsError) throw receiptsError;
      receiptsPreview = receipts || [];
    }

    const ageSeconds = formatAgeSeconds(feed.ageSeconds);
    const blockHighRisk = feed.status === 'unknown';

    return {
      ...snapshot,
      freshness_status: feed.status,
      updated_at: feed.updated_at,
      updated_age_seconds: ageSeconds,
      flags: {
        degraded: feed.status !== 'fresh',
        block_high_risk: blockHighRisk,
        requires_step_up: blockHighRisk,
      },
      receipts_preview: receiptsPreview,
    };
  }
}

export type { SpendPowerBreakdown, SpendPowerResult };
