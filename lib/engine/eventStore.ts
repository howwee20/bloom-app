import { supabaseAdmin } from '@/lib/server/supabaseAdmin';

type RawEventInput = {
  source: string;
  event_type: string;
  external_id: string;
  user_id?: string | null;
  payload: Record<string, unknown>;
  signature?: string | null;
  headers?: Record<string, unknown> | null;
};

type NormalizedEventInput = {
  source: string;
  domain: string;
  event_type: string;
  external_id: string;
  user_id?: string | null;
  status?: string | null;
  amount_cents?: number | null;
  currency?: string | null;
  raw_event_id?: string | null;
  occurred_at?: string | null;
  metadata?: Record<string, unknown> | null;
};

export class EventStore {
  async recordRawEvent(input: RawEventInput) {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('raw_events')
      .select('*')
      .eq('source', input.source)
      .eq('event_type', input.event_type)
      .eq('external_id', input.external_id)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing) return { event: existing, isNew: false };

    const { data, error } = await supabaseAdmin
      .from('raw_events')
      .insert({
        source: input.source,
        event_type: input.event_type,
        external_id: input.external_id,
        user_id: input.user_id ?? null,
        signature: input.signature ?? null,
        headers: input.headers ?? {},
        payload: input.payload,
      })
      .select('*')
      .single();

    if (error || !data) throw error;
    return { event: data, isNew: true };
  }

  async recordNormalizedEvent(input: NormalizedEventInput) {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from('normalized_events')
      .select('*')
      .eq('source', input.source)
      .eq('event_type', input.event_type)
      .eq('external_id', input.external_id)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing) return { event: existing, isNew: false };

    const { data, error } = await supabaseAdmin
      .from('normalized_events')
      .insert({
        source: input.source,
        domain: input.domain,
        event_type: input.event_type,
        external_id: input.external_id,
        user_id: input.user_id ?? null,
        status: input.status ?? null,
        amount_cents: input.amount_cents ?? null,
        currency: input.currency ?? 'USD',
        raw_event_id: input.raw_event_id ?? null,
        occurred_at: input.occurred_at ?? new Date().toISOString(),
        metadata: input.metadata ?? {},
      })
      .select('*')
      .single();

    if (error || !data) throw error;
    return { event: data, isNew: true };
  }
}
