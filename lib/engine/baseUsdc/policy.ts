import { normalizeAddress } from '@/providers/base_usdc';

export type UsdcIntent = {
  type: 'send_usdc';
  to: string;
  amount_cents: number;
};

export type AgentScopes = {
  per_tx_limit_cents?: number;
  daily_limit_cents?: number;
  allowlist?: string[];
  blocklist?: string[];
  step_up_threshold_cents?: number;
};

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function normalizeAddressList(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => (typeof item === 'string' ? normalizeAddress(item) : ''))
    .filter((value) => value.length > 0);
}

export function parseAgentScopes(scopesJson: unknown): AgentScopes {
  const scopes = (scopesJson || {}) as Record<string, unknown>;
  return {
    per_tx_limit_cents: asNumber(scopes.per_tx_limit_cents),
    daily_limit_cents: asNumber(scopes.daily_limit_cents),
    allowlist: normalizeAddressList(scopes.allowlist || scopes.allowlist_json),
    blocklist: normalizeAddressList(scopes.blocklist || scopes.blocklist_json),
    step_up_threshold_cents: asNumber(scopes.step_up_threshold_cents),
  };
}

export function evaluateIntent(input: {
  intent: UsdcIntent;
  scopes: AgentScopes;
  spendPowerCents: number;
  dailySpentCents: number;
}) {
  const { intent, scopes, spendPowerCents, dailySpentCents } = input;

  if (!intent || intent.type !== 'send_usdc') {
    return { allowed: false, reason: 'Unsupported intent', requires_step_up: false };
  }

  const amount = Math.round(intent.amount_cents);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { allowed: false, reason: 'Invalid amount', requires_step_up: false };
  }

  const destination = normalizeAddress(intent.to || '');
  if (!destination) {
    return { allowed: false, reason: 'Missing destination address', requires_step_up: false };
  }

  if (scopes.blocklist && scopes.blocklist.includes(destination)) {
    return { allowed: false, reason: 'Destination blocked', requires_step_up: false };
  }

  if (scopes.allowlist && scopes.allowlist.length > 0 && !scopes.allowlist.includes(destination)) {
    return { allowed: false, reason: 'Destination not allowlisted', requires_step_up: false };
  }

  if (typeof scopes.per_tx_limit_cents === 'number' && amount > scopes.per_tx_limit_cents) {
    return { allowed: false, reason: 'Per-tx limit exceeded', requires_step_up: false };
  }

  if (typeof scopes.daily_limit_cents === 'number' && (dailySpentCents + amount) > scopes.daily_limit_cents) {
    return { allowed: false, reason: 'Daily limit exceeded', requires_step_up: false };
  }

  if (amount > spendPowerCents) {
    return { allowed: false, reason: 'Insufficient spend power', requires_step_up: false };
  }

  const requiresStepUp = typeof scopes.step_up_threshold_cents === 'number'
    ? amount >= scopes.step_up_threshold_cents
    : false;

  return { allowed: true, reason: 'Allowed', requires_step_up: requiresStepUp };
}
