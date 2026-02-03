import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { ExternalLinkService } from './externalLinks';
import { listUnitTransactions } from './integrations/unitClient';

type RemoteTransaction = {
  id: string;
  attributes?: Record<string, unknown>;
};

function parseCents(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const trimmed = value.trim();
    if (trimmed.includes('.')) {
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) {
        return Math.round(parsed * 100);
      }
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return Math.round(parsed);
    }
  }
  return null;
}

function formatCents(amountCents: number) {
  const sign = amountCents < 0 ? '-' : '';
  const abs = Math.abs(amountCents);
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

function normalizeRemoteTransaction(txn: RemoteTransaction) {
  const attrs = txn.attributes || {};
  const amountRaw = parseCents((attrs as any).amount ?? (attrs as any).amountCents ?? (attrs as any).amount_cents);
  if (amountRaw === null) return null;
  const currency = String((attrs as any).currency || 'USD');
  const directionRaw = String((attrs as any).direction || (attrs as any).type || '').toLowerCase();
  let direction: 'debit' | 'credit' = amountRaw < 0 ? 'debit' : 'credit';
  if (directionRaw.includes('debit') || directionRaw.includes('out')) direction = 'debit';
  if (directionRaw.includes('credit') || directionRaw.includes('in')) direction = 'credit';
  const occurredAt = (attrs as any).createdAt || (attrs as any).occurredAt || (attrs as any).timestamp || new Date().toISOString();
  return {
    transaction_id: txn.id,
    amount_cents: Math.abs(amountRaw),
    currency,
    direction,
    status: (attrs as any).status ? String((attrs as any).status) : null,
    created_at: String(occurredAt),
  };
}

export class UnitReconciliationService {
  private externalLinks = new ExternalLinkService();

  private async recordMismatch(userId: string, payload: {
    account_id: string;
    transaction_id?: string | null;
    kind: string;
    details: Record<string, unknown>;
  }) {
    await supabaseAdmin
      .from('reconciliation_mismatches')
      .insert({
        user_id: userId,
        account_id: payload.account_id,
        transaction_id: payload.transaction_id ?? null,
        kind: payload.kind,
        details_json: payload.details,
      });
  }

  private async recordReceipt(userId: string, input: {
    provider_event_id?: string | null;
    related_transaction_id?: string | null;
    delta_spend_power_cents?: number;
    what_happened: string;
    why_changed: string;
    what_happens_next: string;
  }) {
    const providerEventId = input.provider_event_id
      || (input.related_transaction_id ? `reconcile:${input.related_transaction_id}` : null);

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('receipts')
      .select('id')
      .eq('user_id', userId)
      .eq('source', 'reconcile')
      .eq('provider_event_id', providerEventId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return;

    await supabaseAdmin
      .from('receipts')
      .insert({
        user_id: userId,
        type: 'reconcile',
        title: input.what_happened,
        subtitle: input.why_changed,
        amount_cents: Math.abs(input.delta_spend_power_cents ?? 0),
        occurred_at: new Date().toISOString(),
        metadata_json: {},
        source: 'reconcile',
        provider_event_id: providerEventId,
        related_transaction_id: input.related_transaction_id ?? null,
        delta_spend_power_cents: input.delta_spend_power_cents ?? null,
        what_happened: input.what_happened,
        why_changed: input.why_changed,
        what_happens_next: input.what_happens_next,
        fix_cta: 'Fix an issue',
      });
  }

  async reconcileUser(userId: string, options?: { since?: string; limit?: number }) {
    const link = await this.externalLinks.getLink(userId, 'unit');
    if (!link?.bank_account_id) {
      throw new Error('No Unit account linked');
    }

    const response = await listUnitTransactions(link.bank_account_id, {
      limit: options?.limit ?? 100,
      since: options?.since,
    });

    if (!response.ok) {
      throw new Error(`Unit transactions fetch failed (${response.status})`);
    }

    const rawList = (response.data as any).data || (response.data as any).transactions || [];
    const remoteTransactions: RemoteTransaction[] = Array.isArray(rawList) ? rawList : [];
    const normalized = remoteTransactions
      .map(normalizeRemoteTransaction)
      .filter((row): row is NonNullable<typeof row> => !!row);

    const ids = normalized.map((row) => row.transaction_id);
    const { data: local, error: localError } = ids.length === 0
      ? { data: [], error: null }
      : await supabaseAdmin
        .from('transactions')
        .select('transaction_id, amount_cents, currency, direction, status, created_at')
        .eq('user_id', userId)
        .in('transaction_id', ids);

    if (localError) throw localError;
    const localMap = new Map((local || []).map((row) => [row.transaction_id, row]));

    for (const remote of normalized) {
      const existing = localMap.get(remote.transaction_id);
      if (!existing) {
        await supabaseAdmin
          .from('transactions')
          .insert({
            transaction_id: remote.transaction_id,
            account_id: link.bank_account_id,
            user_id: userId,
            amount_cents: remote.amount_cents,
            currency: remote.currency,
            direction: remote.direction,
            status: remote.status,
            created_at: remote.created_at,
          });

        await this.recordMismatch(userId, {
          account_id: link.bank_account_id,
          transaction_id: remote.transaction_id,
          kind: 'missing_local',
          details: { amount_cents: remote.amount_cents, direction: remote.direction },
        });

        const delta = remote.direction === 'debit' ? -remote.amount_cents : remote.amount_cents;
        await this.recordReceipt(userId, {
          related_transaction_id: remote.transaction_id,
          delta_spend_power_cents: delta,
          what_happened: `Reconciled missing transaction for ${formatCents(remote.amount_cents)}`,
          why_changed: 'Unit settlement is the source of truth.',
          what_happens_next: 'Your balance now reflects settlement history.',
        });
        continue;
      }

      if (Number(existing.amount_cents) !== remote.amount_cents || existing.direction !== remote.direction) {
        await supabaseAdmin
          .from('transactions')
          .update({
            amount_cents: remote.amount_cents,
            currency: remote.currency,
            direction: remote.direction,
            status: remote.status,
            created_at: remote.created_at,
            account_id: link.bank_account_id,
          })
          .eq('transaction_id', remote.transaction_id);

        await this.recordMismatch(userId, {
          account_id: link.bank_account_id,
          transaction_id: remote.transaction_id,
          kind: 'amount_mismatch',
          details: {
            local_amount_cents: existing.amount_cents,
            remote_amount_cents: remote.amount_cents,
            local_direction: existing.direction,
            remote_direction: remote.direction,
          },
        });

        const delta = remote.direction === 'debit'
          ? -remote.amount_cents
          : remote.amount_cents;
        await this.recordReceipt(userId, {
          related_transaction_id: remote.transaction_id,
          delta_spend_power_cents: delta,
          what_happened: `Reconciled transaction for ${formatCents(remote.amount_cents)}`,
          why_changed: 'Unit settlement corrected local transaction data.',
          what_happens_next: 'Review your activity if anything looks off.',
        });
      }
    }

    if (ids.length > 0) {
      const { data: localAll, error: localAllError } = await supabaseAdmin
        .from('transactions')
        .select('transaction_id')
        .eq('user_id', userId)
        .eq('account_id', link.bank_account_id);
      if (localAllError) throw localAllError;
      const remoteIds = new Set(ids);
      for (const row of localAll || []) {
        if (!remoteIds.has(row.transaction_id)) {
          await this.recordMismatch(userId, {
            account_id: link.bank_account_id,
            transaction_id: row.transaction_id,
            kind: 'missing_remote',
            details: {},
          });
        }
      }
    }

    return {
      ok: true,
      account_id: link.bank_account_id,
      remote_count: normalized.length,
    };
  }
}
