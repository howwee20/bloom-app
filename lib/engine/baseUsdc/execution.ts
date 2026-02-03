import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { BaseUsdcSpendPowerEngine } from './spendPower';
import { BaseUsdcReceiptService } from './receipts';
import { ExternalSignerProvider } from './signer';
import { evaluateIntent, parseAgentScopes, type UsdcIntent } from './policy';
import { validateSignedTransfer, buildUnsignedTransfer } from './tx';
import type { CanActInput, CanActResult, ExecuteInput, ExecuteResult } from './types';

const PROVIDER_NAME = 'base_usdc';

function resolveNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function startOfDayUtc() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  return start.toISOString();
}

export class BaseUsdcExecutionService {
  private spendPower: BaseUsdcSpendPowerEngine;
  private receipts = new BaseUsdcReceiptService();
  private signer = new ExternalSignerProvider();

  constructor(spendPower?: BaseUsdcSpendPowerEngine, signer?: ExternalSignerProvider) {
    this.spendPower = spendPower || new BaseUsdcSpendPowerEngine();
    if (signer) this.signer = signer;
  }

  private async getAgent(userId: string, agentId: string) {
    const { data, error } = await supabaseAdmin
      .from('agent_tokens')
      .select('*')
      .eq('user_id', userId)
      .eq('agent_id', agentId)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.status !== 'active') return null;
    return data as { scopes_json?: Record<string, unknown> };
  }

  private async getUserFlags(userId: string) {
    const { data, error } = await supabaseAdmin
      .from('user_flags')
      .select('frozen, freeze_reason')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data || { frozen: false, freeze_reason: null };
  }

  private async getDailySpentCents(userId: string, agentId: string) {
    const { data, error } = await supabaseAdmin
      .from('executions')
      .select('amount_cents')
      .eq('user_id', userId)
      .eq('agent_id', agentId)
      .in('status', ['queued', 'broadcast', 'confirmed'])
      .gte('created_at', startOfDayUtc());
    if (error) throw error;
    return (data || []).reduce((sum, row) => sum + Number(row.amount_cents || 0), 0);
  }

  private async getRpcHealthStatus() {
    const { data, error } = await supabaseAdmin
      .from('rpc_health')
      .select('status')
      .eq('provider_name', PROVIDER_NAME)
      .maybeSingle();
    if (error) throw error;
    return (data?.status as 'fresh' | 'stale' | 'unknown') || 'unknown';
  }

  private async createQuote(input: {
    userId: string;
    agentId: string;
    intent: UsdcIntent;
    allowed: boolean;
    requiresStepUp: boolean;
    reason: string;
    idempotencyKey: string;
  }) {
    const ttlSeconds = resolveNumber('QUOTE_TTL_SECONDS', 300);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    const { data, error } = await supabaseAdmin
      .from('quotes')
      .insert({
        user_id: input.userId,
        agent_id: input.agentId,
        intent_json: input.intent,
        allowed: input.allowed,
        requires_step_up: input.requiresStepUp,
        reason: input.reason,
        expires_at: expiresAt,
        idempotency_key: input.idempotencyKey,
        created_at: nowIso(),
      })
      .select('*')
      .single();

    if (error) throw error;
    return data as { quote_id: string; expires_at: string };
  }

  async canAct(input: CanActInput): Promise<CanActResult> {
    if (!input?.user_id || !input.agent_id || !input.intent || !input.idempotency_key) {
      return {
        allowed: false,
        reason: 'Missing request fields',
        requires_step_up: false,
        quote_id: null,
        expires_at: null,
        freshness_status: await this.getRpcHealthStatus(),
      };
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('quotes')
      .select('quote_id, allowed, requires_step_up, reason, expires_at')
      .eq('user_id', input.user_id)
      .eq('agent_id', input.agent_id)
      .eq('idempotency_key', input.idempotency_key)
      .maybeSingle();
    if (existingError) throw existingError;

    const spendPower = await this.spendPower.calculateSpendPower(input.user_id);

    if (existing) {
      return {
        allowed: existing.allowed,
        reason: existing.reason || (existing.allowed ? 'Allowed' : 'Not allowed'),
        requires_step_up: existing.requires_step_up,
        quote_id: existing.quote_id,
        expires_at: existing.expires_at,
        freshness_status: spendPower.freshness_status,
      };
    }

    const flags = await this.getUserFlags(input.user_id);
    if (flags.frozen) {
      return {
        allowed: false,
        reason: flags.freeze_reason || 'User frozen',
        requires_step_up: false,
        quote_id: null,
        expires_at: null,
        freshness_status: spendPower.freshness_status,
      };
    }

    if (spendPower.freshness_status !== 'fresh') {
      return {
        allowed: false,
        reason: 'RPC health stale',
        requires_step_up: false,
        quote_id: null,
        expires_at: null,
        freshness_status: spendPower.freshness_status,
      };
    }

    const agent = await this.getAgent(input.user_id, input.agent_id);
    if (!agent) {
      return {
        allowed: false,
        reason: 'Agent revoked',
        requires_step_up: false,
        quote_id: null,
        expires_at: null,
        freshness_status: spendPower.freshness_status,
      };
    }

    const scopes = parseAgentScopes(agent.scopes_json || {});
    const dailySpent = await this.getDailySpentCents(input.user_id, input.agent_id);

    const evaluation = evaluateIntent({
      intent: input.intent,
      scopes,
      spendPowerCents: spendPower.spend_power_cents,
      dailySpentCents: dailySpent,
    });

    let quoteId: string | null = null;
    let expiresAt: string | null = null;

    if (evaluation.allowed || evaluation.requires_step_up) {
      const quote = await this.createQuote({
        userId: input.user_id,
        agentId: input.agent_id,
        intent: input.intent,
        allowed: evaluation.allowed,
        requiresStepUp: evaluation.requires_step_up,
        reason: evaluation.reason,
        idempotencyKey: input.idempotency_key,
      });
      quoteId = quote.quote_id;
      expiresAt = quote.expires_at;
    }

    return {
      allowed: evaluation.allowed,
      reason: evaluation.reason,
      requires_step_up: evaluation.requires_step_up,
      quote_id: quoteId,
      expires_at: expiresAt,
      freshness_status: spendPower.freshness_status,
    };
  }

  private async findExecutionByIdempotency(userId: string, agentId: string, idempotencyKey: string) {
    const { data, error } = await supabaseAdmin
      .from('executions')
      .select('*')
      .eq('user_id', userId)
      .eq('agent_id', agentId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  private async findExecutionByQuote(quoteId: string) {
    const { data, error } = await supabaseAdmin
      .from('executions')
      .select('*')
      .eq('quote_id', quoteId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  private async ensureReserve(userId: string, quoteId: string, amountCents: number) {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('reserves')
      .select('*')
      .eq('user_id', userId)
      .eq('external_ref', quoteId)
      .eq('status', 'active')
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return existing;

    const { data, error } = await supabaseAdmin
      .from('reserves')
      .insert({
        user_id: userId,
        amount_cents: amountCents,
        reason: 'EXECUTE_SEND_USDC',
        status: 'active',
        external_ref: quoteId,
        created_at: nowIso(),
        updated_at: nowIso(),
      })
      .select('*')
      .single();

    if (error) throw error;
    return data;
  }

  private async cancelReserve(userId: string, quoteId: string) {
    await supabaseAdmin
      .from('reserves')
      .update({ status: 'canceled', updated_at: nowIso() })
      .eq('user_id', userId)
      .eq('external_ref', quoteId)
      .eq('status', 'active');
  }

  async execute(input: ExecuteInput): Promise<ExecuteResult> {
    if (!input?.quote_id || !input.idempotency_key) {
      return { status: 'failed', exec_id: null, failure_reason: 'Missing request fields' };
    }

    const { data: quote, error } = await supabaseAdmin
      .from('quotes')
      .select('*')
      .eq('quote_id', input.quote_id)
      .maybeSingle();
    if (error) throw error;
    if (!quote) {
      return { status: 'failed', exec_id: null, failure_reason: 'Quote not found' };
    }

    if (quote.expires_at && new Date(quote.expires_at).getTime() < Date.now()) {
      return { status: 'failed', exec_id: null, failure_reason: 'Quote expired' };
    }

    if (!quote.allowed && !quote.requires_step_up) {
      return { status: 'failed', exec_id: null, failure_reason: 'Quote not allowed' };
    }

    const existingByQuote = await this.findExecutionByQuote(input.quote_id);
    if (existingByQuote) {
      return {
        status: existingByQuote.status,
        exec_id: existingByQuote.exec_id,
        tx_hash: existingByQuote.tx_hash,
        failure_reason: existingByQuote.failure_reason,
      };
    }

    const existingByIdempotency = await this.findExecutionByIdempotency(quote.user_id, quote.agent_id, input.idempotency_key);
    if (existingByIdempotency) {
      return {
        status: existingByIdempotency.status,
        exec_id: existingByIdempotency.exec_id,
        tx_hash: existingByIdempotency.tx_hash,
        failure_reason: existingByIdempotency.failure_reason,
      };
    }

    const flags = await this.getUserFlags(quote.user_id);
    if (flags.frozen) {
      return { status: 'failed', exec_id: null, failure_reason: flags.freeze_reason || 'User frozen' };
    }

    const agent = await this.getAgent(quote.user_id, quote.agent_id);
    if (!agent) {
      return { status: 'failed', exec_id: null, failure_reason: 'Agent revoked' };
    }

    const spendPower = await this.spendPower.calculateSpendPower(quote.user_id);
    if (spendPower.freshness_status !== 'fresh') {
      if (process.env.ALLOW_DEGRADED_EXECUTION !== 'true') {
        return { status: 'failed', exec_id: null, failure_reason: 'RPC health stale' };
      }
    }

    const scopes = parseAgentScopes(agent.scopes_json || {});
    const dailySpent = await this.getDailySpentCents(quote.user_id, quote.agent_id);
    const evaluation = evaluateIntent({
      intent: quote.intent_json as UsdcIntent,
      scopes,
      spendPowerCents: spendPower.spend_power_cents,
      dailySpentCents: dailySpent,
    });

    if (!evaluation.allowed) {
      return { status: 'failed', exec_id: null, failure_reason: evaluation.reason };
    }

    if (quote.requires_step_up && !input.step_up_token) {
      return {
        status: 'requires_step_up',
        exec_id: null,
        requires_step_up: true,
        instructions: {
          message: 'Provide signed payload to continue execution.',
          tx_request: buildUnsignedTransfer(quote.intent_json as UsdcIntent),
        },
      };
    }

    if (!input.signed_payload) {
      if (process.env.ENABLE_SERVER_CUSTODY === 'true') {
        return { status: 'failed', exec_id: null, failure_reason: 'Server custody signing not configured' };
      }
      return {
        status: 'requires_step_up',
        exec_id: null,
        requires_step_up: true,
        instructions: {
          message: 'Signed payload required for execution.',
          tx_request: buildUnsignedTransfer(quote.intent_json as UsdcIntent),
        },
      };
    }

    const intent = quote.intent_json as UsdcIntent;
    const validation = validateSignedTransfer(input.signed_payload, intent);
    if (!validation.ok) {
      return { status: 'failed', exec_id: null, failure_reason: validation.reason };
    }

    const amountCents = Math.round(intent.amount_cents || 0);
    const reserve = await this.ensureReserve(quote.user_id, quote.quote_id, amountCents);

    const { data: execution, error: executionError } = await supabaseAdmin
      .from('executions')
      .insert({
        quote_id: quote.quote_id,
        user_id: quote.user_id,
        agent_id: quote.agent_id,
        status: 'queued',
        amount_cents: amountCents,
        idempotency_key: input.idempotency_key,
        created_at: nowIso(),
        updated_at: nowIso(),
      })
      .select('*')
      .single();

    if (executionError || !execution) {
      const existing = await this.findExecutionByQuote(quote.quote_id);
      if (existing) {
        return {
          status: existing.status,
          exec_id: existing.exec_id,
          tx_hash: existing.tx_hash,
          failure_reason: existing.failure_reason,
        };
      }

      await this.cancelReserve(quote.user_id, quote.quote_id);
      await this.receipts.recordReceipt({
        userId: quote.user_id,
        source: 'execution',
        type: 'reserve_canceled',
        title: 'Reserve canceled',
        subtitle: 'Execution creation failed',
        amountCents,
        occurredAt: nowIso(),
        providerEventId: `${reserve.reserve_id}:create_failed`,
        deltaSpendPowerCents: amountCents,
        whatHappened: 'Reserve canceled after failure.',
        whyChanged: 'Execution could not be created.',
        whatHappensNext: 'No funds moved.',
        metadata: { quote_id: quote.quote_id },
      });
      throw executionError || new Error('Unable to create execution');
    }

    await this.receipts.recordReceipt({
      userId: quote.user_id,
      source: 'execution',
      type: 'reserve_created',
      title: 'Reserve created',
      subtitle: 'Execution queued',
      amountCents,
      occurredAt: nowIso(),
      providerEventId: `${reserve.reserve_id}:created`,
      deltaSpendPowerCents: -amountCents,
      whatHappened: 'Reserve created for USDC transfer.',
      whyChanged: 'Execution is pending confirmation.',
      whatHappensNext: 'Reserve releases after confirmation.',
      metadata: { quote_id: quote.quote_id },
    });

    let txHash: string | null = null;
    try {
      const signed = await this.signer.signAndSendTx(quote.user_id, { raw_signed_tx: input.signed_payload });
      txHash = signed.tx_hash;

      await supabaseAdmin
        .from('executions')
        .update({ status: 'broadcast', tx_hash: txHash, updated_at: nowIso() })
        .eq('exec_id', execution.exec_id);

      await this.receipts.recordReceipt({
        userId: quote.user_id,
        source: 'execution',
        type: 'execution_broadcast',
        title: 'Execution broadcast',
        subtitle: 'USDC transfer sent to network',
        amountCents,
        occurredAt: nowIso(),
        txHash,
        providerEventId: `${execution.exec_id}:broadcast`,
        deltaSpendPowerCents: 0,
        whatHappened: 'Execution broadcast to Base.',
        whyChanged: 'Awaiting confirmations.',
        whatHappensNext: 'We will confirm onchain.',
        metadata: { quote_id: quote.quote_id },
      });

      if (spendPower.freshness_status !== 'fresh' && process.env.ALLOW_DEGRADED_EXECUTION === 'true') {
        await this.receipts.recordReceipt({
          userId: quote.user_id,
          source: 'policy',
          type: 'degraded_override',
          title: 'Degraded execution override',
          subtitle: 'RPC health was not fresh',
          amountCents: 0,
          occurredAt: nowIso(),
          providerEventId: `${execution.exec_id}:degraded`,
          deltaSpendPowerCents: 0,
          whatHappened: 'Execution allowed under degraded conditions.',
          whyChanged: 'ALLOW_DEGRADED_EXECUTION enabled.',
          whatHappensNext: 'Monitor confirmations closely.',
          metadata: { quote_id: quote.quote_id },
        });
      }

      return { status: 'broadcast', exec_id: execution.exec_id, tx_hash: txHash };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Broadcast failed';
      await supabaseAdmin
        .from('executions')
        .update({ status: 'failed', failure_reason: message, updated_at: nowIso() })
        .eq('exec_id', execution.exec_id);
      await this.cancelReserve(quote.user_id, quote.quote_id);

      await this.receipts.recordReceipt({
        userId: quote.user_id,
        source: 'execution',
        type: 'reserve_canceled',
        title: 'Reserve canceled',
        subtitle: 'Broadcast failed',
        amountCents,
        occurredAt: nowIso(),
        providerEventId: `${reserve.reserve_id}:broadcast_failed`,
        deltaSpendPowerCents: amountCents,
        whatHappened: 'Reserve canceled after broadcast failure.',
        whyChanged: message,
        whatHappensNext: 'No funds moved.',
        metadata: { quote_id: quote.quote_id },
      });

      await this.receipts.recordReceipt({
        userId: quote.user_id,
        source: 'execution',
        type: 'execution_failed',
        title: 'Execution failed',
        subtitle: 'Broadcast failed',
        amountCents,
        occurredAt: nowIso(),
        providerEventId: `${execution.exec_id}:broadcast_failed`,
        deltaSpendPowerCents: 0,
        whatHappened: 'Execution broadcast failed.',
        whyChanged: message,
        whatHappensNext: 'No funds moved.',
        metadata: { quote_id: quote.quote_id },
      });

      return { status: 'failed', exec_id: execution.exec_id, failure_reason: message };
    }
  }

  async freezeUser(input: { user_id: string; frozen: boolean; reason?: string | null }) {
    const { data, error } = await supabaseAdmin
      .from('user_flags')
      .upsert({
        user_id: input.user_id,
        frozen: input.frozen,
        freeze_reason: input.reason ?? null,
        updated_at: nowIso(),
      }, { onConflict: 'user_id' })
      .select('*')
      .single();
    if (error) throw error;

    await this.receipts.recordReceipt({
      userId: input.user_id,
      source: 'policy',
      type: input.frozen ? 'user_frozen' : 'user_unfrozen',
      title: input.frozen ? 'Account frozen' : 'Account unfrozen',
      subtitle: input.reason || null,
      amountCents: 0,
      occurredAt: nowIso(),
      providerEventId: `${input.user_id}:${input.frozen ? 'frozen' : 'unfrozen'}`,
      deltaSpendPowerCents: 0,
      whatHappened: input.frozen ? 'Account frozen.' : 'Account unfrozen.',
      whyChanged: input.reason || 'Policy update.',
      whatHappensNext: input.frozen ? 'Execution is blocked.' : 'Execution allowed.',
      metadata: { frozen: input.frozen },
    });

    return data;
  }

  async revokeAgent(input: { user_id: string; agent_id: string }) {
    const { data, error } = await supabaseAdmin
      .from('agent_tokens')
      .update({ status: 'revoked', revoked_at: nowIso() })
      .eq('user_id', input.user_id)
      .eq('agent_id', input.agent_id)
      .select('*')
      .single();
    if (error) throw error;

    await this.receipts.recordReceipt({
      userId: input.user_id,
      source: 'policy',
      type: 'agent_revoked',
      title: 'Agent revoked',
      subtitle: `Agent ${input.agent_id} revoked`,
      amountCents: 0,
      occurredAt: nowIso(),
      providerEventId: `${input.agent_id}:revoked`,
      deltaSpendPowerCents: 0,
      whatHappened: 'Agent access revoked.',
      whyChanged: 'Policy update.',
      whatHappensNext: 'Agent can no longer execute.',
      metadata: { agent_id: input.agent_id },
    });

    return data;
  }

  async listReceipts(userId: string, limit = 20) {
    const { data, error } = await supabaseAdmin
      .from('receipts')
      .select('receipt_id, source, tx_hash, what_happened, why_changed, what_happens_next, delta_spend_power_cents, occurred_at')
      .eq('user_id', userId)
      .order('occurred_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  }
}
