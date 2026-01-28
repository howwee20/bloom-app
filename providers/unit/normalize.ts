import type { DisputeUpdate, HoldStatus, HoldUpdate, SpendPowerEvent, TransactionUpdate } from '@/lib/engine/spendPowerKernel';

export type UnitEventData = {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, unknown>;
};

export type UnitIncluded = {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, unknown>;
};

export type UnitWebhookEnvelope = {
  data: UnitEventData;
  included?: UnitIncluded[];
};

export function extractUnitEventOccurredAt(event: UnitEventData, included?: UnitIncluded[]) {
  const attrs = event.attributes || {};
  const candidates: Array<unknown> = [
    (attrs as any).occurredAt,
    (attrs as any).createdAt,
    (attrs as any).updatedAt,
    (attrs as any).timestamp,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value) return value;
  }

  const authorizationId = (event.relationships as any)?.authorization?.data?.id;
  const auth = included?.find((item) => item.type === 'authorization' && item.id === authorizationId);
  if (auth?.attributes && typeof (auth.attributes as any).createdAt === 'string') {
    return (auth.attributes as any).createdAt as string;
  }

  const transactionId = (event.relationships as any)?.transaction?.data?.id;
  const txn = included?.find((item) => item.type === 'transaction' && item.id === transactionId);
  if (txn?.attributes && typeof (txn.attributes as any).createdAt === 'string') {
    return (txn.attributes as any).createdAt as string;
  }

  return null;
}

export function normalizeUnitWebhookPayload(payload: unknown): UnitWebhookEnvelope[] {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    return payload.map((event) => ({ data: event as UnitEventData }));
  }
  if (typeof payload === 'object') {
    const body = payload as { data?: UnitEventData | UnitEventData[]; included?: UnitIncluded[] };
    if (Array.isArray(body.data)) {
      return body.data.map((event) => ({ data: event, included: body.included }));
    }
    if (body.data) {
      return [{ data: body.data, included: body.included }];
    }
    if ((payload as UnitEventData).id && (payload as UnitEventData).type) {
      return [{ data: payload as UnitEventData }];
    }
  }
  return [];
}

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

function extractRelationshipId(event: UnitEventData, name: string): string | null {
  const rel = event.relationships?.[name] as { data?: { id?: string } } | undefined;
  if (rel?.data?.id) return rel.data.id;
  return null;
}

function findIncluded(included: UnitIncluded[] | undefined, type: string, id: string | null) {
  if (!included || !id) return null;
  return included.find((item) => item.type === type && item.id === id) || null;
}

function extractAccountId(event: UnitEventData, included: UnitIncluded[] | undefined): string | null {
  const direct = extractRelationshipId(event, 'account');
  if (direct) return direct;

  const authorizationId = extractRelationshipId(event, 'authorization');
  const auth = findIncluded(included, 'authorization', authorizationId);
  if (auth?.relationships?.account && (auth.relationships.account as any).data?.id) {
    return (auth.relationships.account as any).data.id as string;
  }

  const transactionId = extractRelationshipId(event, 'transaction');
  const txn = findIncluded(included, 'transaction', transactionId);
  if (txn?.relationships?.account && (txn.relationships.account as any).data?.id) {
    return (txn.relationships.account as any).data.id as string;
  }

  const attrs = event.attributes || {};
  if (typeof (attrs as any).accountId === 'string') {
    return (attrs as any).accountId as string;
  }

  return null;
}

function extractAuthorizationDetails(
  event: UnitEventData,
  included: UnitIncluded[] | undefined,
  occurredAt: string
): Omit<HoldUpdate, 'status'> | null {
  const authorizationId = extractRelationshipId(event, 'authorization')
    || (event.attributes as any)?.authorizationId
    || (event.attributes as any)?.authorization_id
    || null;
  const authorization = findIncluded(included, 'authorization', authorizationId) as UnitIncluded | null;
  const attrs = (authorization?.attributes || event.attributes || {}) as Record<string, unknown>;
  const amountCents = parseCents((attrs as any).amount ?? (attrs as any).amountCents ?? (attrs as any).amount_cents);
  const currency = String((attrs as any).currency || 'USD');
  const merchantName = (attrs as any).merchant?.name || (attrs as any).merchantName || (attrs as any).merchant_name || null;
  const merchantId = (attrs as any).merchant?.id || (attrs as any).merchantId || (attrs as any).merchant_id || null;
  const mcc = (attrs as any).merchant?.mcc || (attrs as any).mcc || null;

  if (!authorizationId) return null;
  return {
    holdId: String(authorizationId),
    accountId: extractAccountId(event, included),
    merchantName: merchantName ? String(merchantName) : null,
    merchantId: merchantId ? String(merchantId) : null,
    mcc: mcc ? String(mcc) : null,
    amountCents: amountCents ?? 0,
    currency,
    occurredAt,
    rawAuthorization: authorization?.attributes ? (authorization.attributes as Record<string, unknown>) : null,
  };
}

function extractTransactionDetails(
  event: UnitEventData,
  included: UnitIncluded[] | undefined,
  occurredAt: string
): TransactionUpdate | null {
  const transactionId = extractRelationshipId(event, 'transaction')
    || (event.attributes as any)?.transactionId
    || (event.attributes as any)?.transaction_id
    || null;
  const transaction = findIncluded(included, 'transaction', transactionId) as UnitIncluded | null;
  const attrs = (transaction?.attributes || event.attributes || {}) as Record<string, unknown>;
  const amountRaw = parseCents((attrs as any).amount ?? (attrs as any).amountCents ?? (attrs as any).amount_cents);
  if (!transactionId || amountRaw === null) return null;

  const currency = String((attrs as any).currency || 'USD');
  const directionRaw = ((attrs as any).direction || (attrs as any).type || '').toString().toLowerCase();
  let direction: string | null = null;
  if (directionRaw.includes('debit') || directionRaw.includes('out')) direction = 'debit';
  if (directionRaw.includes('credit') || directionRaw.includes('in')) direction = 'credit';
  if (!direction) {
    direction = amountRaw < 0 ? 'debit' : 'credit';
  }

  const relatedAuthorizationId = extractRelationshipId(event, 'authorization')
    || (transaction ? extractRelationshipId(transaction as UnitEventData, 'authorization') : null)
    || (attrs as any).authorizationId
    || (attrs as any).authorization_id
    || null;

  return {
    transactionId: String(transactionId),
    accountId: extractAccountId(event, included),
    amountCents: Math.abs(amountRaw),
    currency,
    direction,
    status: (attrs as any).status ? String((attrs as any).status) : null,
    occurredAt,
    relatedAuthorizationId: relatedAuthorizationId ? String(relatedAuthorizationId) : null,
    rawTransaction: transaction?.attributes ? (transaction.attributes as Record<string, unknown>) : null,
  };
}

function extractDisputeDetails(
  event: UnitEventData,
  included: UnitIncluded[] | undefined,
  occurredAt: string
): DisputeUpdate | null {
  const disputeId = extractRelationshipId(event, 'dispute')
    || (event.attributes as any)?.disputeId
    || (event.attributes as any)?.dispute_id
    || null;
  const dispute = findIncluded(included, 'dispute', disputeId) as UnitIncluded | null;
  const attrs = (dispute?.attributes || event.attributes || {}) as Record<string, unknown>;
  if (!disputeId) return null;
  const amountCents = parseCents((attrs as any).amount ?? (attrs as any).amountCents ?? (attrs as any).amount_cents);
  const status = (attrs as any).status ? String((attrs as any).status) : null;
  const reason = (attrs as any).reason ? String((attrs as any).reason) : null;
  const transactionId = (attrs as any).transactionId
    || (attrs as any).transaction_id
    || extractRelationshipId(event, 'transaction');

  return {
    disputeId: String(disputeId),
    transactionId: transactionId ? String(transactionId) : null,
    status,
    amountCents,
    reason,
    occurredAt,
  };
}

export function normalizeUnitEvent(envelope: UnitWebhookEnvelope): SpendPowerEvent | null {
  const event = envelope.data;
  if (!event?.id || !event.type) return null;

  const included = envelope.included || [];
  const occurredAt = extractUnitEventOccurredAt(event, included) || new Date().toISOString();
  const accountId = extractAccountId(event, included);

  const base = {
    provider: 'unit',
    providerEventId: String(event.id),
    occurredAt,
    accountId,
    linkField: 'bank_account_id' as const,
  };

  if (event.type === 'authorization.created') {
    const details = extractAuthorizationDetails(event, included, occurredAt);
    if (!details) throw new Error('Missing authorization details');
    return {
      ...base,
      type: 'HOLD_CREATED',
      hold: {
        ...details,
        status: 'active',
      },
    };
  }

  if (event.type === 'authorization.amountChanged' || event.type === 'authorization.updated') {
    const details = extractAuthorizationDetails(event, included, occurredAt);
    if (!details) throw new Error('Missing authorization details');
    return {
      ...base,
      type: 'HOLD_CHANGED',
      hold: {
        ...details,
        status: 'active',
      },
    };
  }

  if (event.type === 'authorization.canceled') {
    const details = extractAuthorizationDetails(event, included, occurredAt);
    if (!details) throw new Error('Missing authorization details');

    let status: HoldStatus = 'canceled';
    const reason = String((event.attributes as any)?.reason || '');
    if (reason.toLowerCase().includes('expire')) {
      status = 'expired';
    }

    return {
      ...base,
      type: 'HOLD_CANCELED',
      hold: {
        ...details,
        status,
      },
    };
  }

  if (event.type === 'authorization.declined') {
    const details = extractAuthorizationDetails(event, included, occurredAt);
    if (!details) throw new Error('Missing authorization details');
    return {
      ...base,
      type: 'HOLD_DECLINED',
      hold: {
        ...details,
        status: 'declined',
      },
    };
  }

  if (event.type === 'transaction.created') {
    const txn = extractTransactionDetails(event, included, occurredAt);
    if (!txn) throw new Error('Missing transaction details');
    return {
      ...base,
      type: 'TXN_POSTED',
      transaction: txn,
    };
  }

  if (event.type === 'dispute.created') {
    const dispute = extractDisputeDetails(event, included, occurredAt);
    if (!dispute) throw new Error('Missing dispute details');
    return {
      ...base,
      type: 'DISPUTE_CREATED',
      dispute,
    };
  }

  if (event.type === 'dispute.status.change') {
    const dispute = extractDisputeDetails(event, included, occurredAt);
    if (!dispute) throw new Error('Missing dispute details');
    return {
      ...base,
      type: 'DISPUTE_UPDATED',
      dispute,
    };
  }

  return null;
}
