import { z } from 'zod';
import { EventStore } from '@/lib/engine/eventStore';
import { getCardProcessorAdapter } from '@/lib/engine/adapters/cardProcessor';
import { MetricsService } from '@/lib/engine/metrics';
import { checkRateLimit } from '@/lib/server/rateLimit';
import { verifyWebhookSignature } from '@/lib/server/webhook';
import { logAdapterSummary } from '@/lib/server/envSummary';
import { readRawBody } from '../column/_utils';

export const config = {
  api: {
    bodyParser: false,
  },
};

const schemas = {
  auth: z.object({
    external_id: z.string(),
    user_id: z.string(),
    merchant_name: z.string(),
    mcc: z.string().optional(),
    amount_cents: z.number(),
    expires_at: z.string().optional(),
  }),
  settlement: z.object({
    external_id: z.string(),
    user_id: z.string(),
    merchant_name: z.string(),
    amount_cents: z.number(),
    auth_id: z.string().optional(),
  }),
  refund: z.object({
    external_id: z.string(),
    user_id: z.string(),
    merchant_name: z.string(),
    amount_cents: z.number(),
    auth_id: z.string().optional(),
  }),
  reversal: z.object({
    external_id: z.string(),
    user_id: z.string(),
    auth_id: z.string(),
    amount_cents: z.number(),
  }),
  dispute: z.object({
    external_id: z.string(),
    user_id: z.string(),
    auth_id: z.string().optional(),
    amount_cents: z.number().optional(),
    reason: z.string().optional(),
  }),
};

type CardEvent = keyof typeof schemas;

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const event = (Array.isArray(req.query?.event) ? req.query.event[0] : req.query?.event) as CardEvent | undefined;
  if (!event || !(event in schemas)) {
    return res.status(404).json({ error: 'Unknown card webhook event' });
  }

  logAdapterSummary();

  const rateKey = `${req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown'}:card:${event}`;
  const rate = checkRateLimit(rateKey, { limit: 120, windowMs: 60_000 });
  if (!rate.allowed) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  const rawBody = await readRawBody(req);
  const signature = req.headers['x-card-signature'] as string | undefined;
  const timestamp = req.headers['x-card-timestamp'] as string | undefined;

  if (!verifyWebhookSignature(rawBody, { secret: process.env.CARD_PROCESSOR_WEBHOOK_SECRET, signature, timestamp })) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  try {
    const start = Date.now();
    const payload = schemas[event].parse(JSON.parse(rawBody));

    const eventStore = new EventStore();
    const rawEvent = await eventStore.recordRawEvent({
      source: 'card_processor',
      event_type: event,
      external_id: payload.external_id,
      user_id: payload.user_id,
      payload,
      signature,
      headers: { 'x-card-timestamp': timestamp ?? null },
    });

    const adapter = getCardProcessorAdapter();
    if (event === 'auth') {
      const result = await adapter.handleAuthWebhook(payload, rawEvent.event.id);
      const metrics = new MetricsService();
      const receivedAt = new Date(rawEvent.event.received_at).getTime();
      await metrics.record({
        user_id: payload.user_id,
        name: 'webhook_lag_ms',
        value: Date.now() - receivedAt,
        metadata: { source: 'card_processor', event_type: event },
      });
      await metrics.recordLatency('auth_decision_latency_ms', start, { source: 'card_processor' }, payload.user_id);
      return res.status(200).json(result);
    }

    if (event === 'settlement') {
      await adapter.handleSettlementWebhook(payload, rawEvent.event.id);
    } else if (event === 'refund') {
      await adapter.handleRefundWebhook(payload, rawEvent.event.id);
    } else if (event === 'reversal') {
      await adapter.handleReversalWebhook(payload, rawEvent.event.id);
    } else if (event === 'dispute') {
      await adapter.handleDisputeWebhook(payload, rawEvent.event.id);
    }

    const metrics = new MetricsService();
    const receivedAt = new Date(rawEvent.event.received_at).getTime();
    await metrics.record({
      user_id: payload.user_id,
      name: 'webhook_lag_ms',
      value: Date.now() - receivedAt,
      metadata: { source: 'card_processor', event_type: event },
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return res.status(500).json({ error: message });
  }
}
