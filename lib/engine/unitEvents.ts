// Deprecated: Unit normalization now lives in providers/unit. Kept for backward compatibility.
export type {
  UnitEventData,
  UnitIncluded,
  UnitWebhookEnvelope,
} from '@/providers/unit';
export {
  normalizeUnitWebhookPayload,
  extractUnitEventOccurredAt as extractEventOccurredAt,
} from '@/providers/unit';
