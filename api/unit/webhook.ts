import { SpendPowerKernel } from '@/lib/engine/spendPowerKernel';
import { SpendPowerEngine } from '@/lib/engine/spendPower';
import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { checkRateLimit } from '@/lib/server/rateLimit';
import { extractUnitEventOccurredAt, normalizeUnitEvent, normalizeUnitWebhookPayload, verifyUnitWebhookSignature } from '@/providers/unit';
import { logAdapterSummary } from '@/lib/server/envSummary';
import { readRawBody } from '../webhooks/column/_utils';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  logAdapterSummary();

  const rateKey = `${req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown'}:unit:webhook`;
  const rate = checkRateLimit(rateKey, { limit: 240, windowMs: 60_000 });
  if (!rate.allowed) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  const rawBody = await readRawBody(req);
  const signatureHeader = req.headers['unit-signature'] || req.headers['x-unit-signature'];
  const timestampHeader = req.headers['unit-timestamp'] || req.headers['x-unit-timestamp'];

  if (!verifyUnitWebhookSignature(rawBody, {
    secret: process.env.UNIT_WEBHOOK_SECRET,
    signatureHeader,
    timestampHeader,
  })) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  const envelopes = normalizeUnitWebhookPayload(payload);
  if (!envelopes.length) {
    return res.status(400).json({ error: 'No Unit events found' });
  }

  const now = new Date().toISOString();
  let latestOccurredAt: string | null = null;
  for (const envelope of envelopes) {
    const occurredAt = extractUnitEventOccurredAt(envelope.data, envelope.included);
    if (occurredAt && (!latestOccurredAt || occurredAt > latestOccurredAt)) {
      latestOccurredAt = occurredAt;
    }
  }

  await supabaseAdmin
    .from('feed_health')
    .upsert({
      feed_name: 'unit_webhook',
      last_event_received_at: now,
      last_event_occurred_at: latestOccurredAt,
      status: 'fresh',
      updated_at: now,
    }, { onConflict: 'feed_name' });

  const kernel = new SpendPowerKernel();
  const processedUserIds = new Set<string>();
  const errors: string[] = [];

  for (const envelope of envelopes) {
    const event = envelope.data;
    if (!event?.id || !event.type) {
      errors.push('Event missing id or type');
      continue;
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('raw_events')
      .select('*')
      .eq('provider', 'unit')
      .eq('provider_event_id', event.id)
      .maybeSingle();

    if (existingError) {
      errors.push(existingError.message || 'raw_events lookup failed');
      continue;
    }

    let rawEvent = existing;

    if (!rawEvent) {
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('raw_events')
        .insert({
          source: 'unit',
          provider: 'unit',
          event_type: event.type,
          type: event.type,
          external_id: event.id,
          provider_event_id: event.id,
          occurred_at: extractUnitEventOccurredAt(event, envelope.included),
          signature: typeof signatureHeader === 'string' ? signatureHeader : null,
          payload: envelope,
          headers: {
            'unit-signature': signatureHeader ?? null,
            'unit-timestamp': timestampHeader ?? null,
          },
        })
        .select('*')
        .single();
      if (insertError || !inserted) {
        errors.push(insertError?.message || 'raw_events insert failed');
        continue;
      }
      rawEvent = inserted;
    }

    if (rawEvent.processed_at) {
      continue;
    }

    let normalizedEvent: ReturnType<typeof normalizeUnitEvent>;
    try {
      normalizedEvent = normalizeUnitEvent(envelope);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unit event normalization failed';
      errors.push(message);
      if (rawEvent.id) {
        await supabaseAdmin
          .from('raw_events')
          .update({ processing_error: message })
          .eq('id', rawEvent.id);
      }
      continue;
    }

    if (!normalizedEvent) {
      await supabaseAdmin
        .from('raw_events')
        .update({ processed_at: new Date().toISOString(), processing_error: null })
        .eq('id', rawEvent.id);
      continue;
    }

    try {
      const result = await kernel.processEvent({
        ...normalizedEvent,
        rawEventId: rawEvent.id,
        userId: rawEvent.user_id ?? normalizedEvent.userId,
      });
      if (result.userId) {
        processedUserIds.add(result.userId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Event processing failed';
      errors.push(message);
    }
  }

  if (errors.length) {
    return res.status(500).json({ error: 'Unit webhook processing failed', details: errors });
  }

  if (processedUserIds.size > 0) {
    const spendPower = new SpendPowerEngine();
    for (const userId of processedUserIds) {
      try {
        await spendPower.calculateSpendPower(userId);
      } catch (error) {
        console.warn('[Unit webhook] Spend power snapshot failed', error);
      }
    }
  }

  return res.status(200).json({ ok: true, processed_users: Array.from(processedUserIds) });
}
