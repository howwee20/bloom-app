const UNIT_API_KEY = process.env.UNIT_API_KEY;
const UNIT_BASE_URL = process.env.UNIT_BASE_URL || 'https://api.unit.co';

export function isUnitConfigured(): boolean {
  return !!UNIT_API_KEY;
}

export async function unitRequest<T = unknown>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: unknown
): Promise<{ ok: boolean; status: number; data: T }> {
  if (!UNIT_API_KEY) {
    throw new Error('UNIT_API_KEY is not configured');
  }

  const res = await fetch(`${UNIT_BASE_URL}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${UNIT_API_KEY}`,
      'Content-Type': 'application/vnd.api+json',
      'Accept': 'application/vnd.api+json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    data = text as unknown as T;
  }

  return { ok: res.ok, status: res.status, data };
}

export type UnitAccount = {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
};

export type UnitTransaction = {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, unknown>;
};

export async function getUnitAccount(accountId: string) {
  return unitRequest<{ data: UnitAccount }>(`/accounts/${accountId}`);
}

export async function listUnitTransactions(accountId: string, params?: { limit?: number; since?: string }) {
  const query = new URLSearchParams();
  query.set('accountId', accountId);
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.since) query.set('since', params.since);
  const path = `/transactions?${query.toString()}`;
  return unitRequest<{ data: UnitTransaction[]; links?: { next?: string } }>(path);
}

export function extractUnitBalanceCents(attributes?: Record<string, unknown>): number | null {
  if (!attributes) return null;

  // TODO: Confirm Unit posted/ledger balance field names to avoid using "available" when it includes holds.
  const candidates: Array<unknown> = [
    (attributes as any).ledgerBalance,
    (attributes as any).postedBalance,
    (attributes as any).balance,
    (attributes as any).availableBalance,
    (attributes as any).balances?.ledger,
    (attributes as any).balances?.posted,
    (attributes as any).balances?.balance,
    (attributes as any).balances?.available,
    (attributes as any).balance?.ledger,
    (attributes as any).balance?.posted,
    (attributes as any).balance?.balance,
    (attributes as any).balance?.available,
    (attributes as any).available,
  ];

  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.round(value);
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return Math.round(parsed);
      }
    }
  }

  return null;
}
