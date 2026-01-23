import { z } from 'zod';
import { ColumnAdapter } from '@/lib/engine/integrations/column';
import { EventStore } from '@/lib/engine/eventStore';
import { MetricsService } from '@/lib/engine/metrics';
import { checkRateLimit } from '@/lib/server/rateLimit';
import { verifyWebhookSignature } from '@/lib/server/webhook';
import { logAdapterSummary } from '@/lib/server/envSummary';
import { readRawBody } from './_utils';

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

  const rateKey = `${req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown'}:column:auth`;
  const rate = checkRateLimit(rateKey, { limit: 120, windowMs: 60_000 });
  if (!rate.allowed) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  const rawBody = await readRawBody(req);
  const signature = req.headers['x-column-signature'] as string | undefined;
  const timestamp = req.headers['x-column-timestamp'] as string | undefined;

  if (!verifyWebhookSignature(rawBody, { secret: process.env.COLUMN_WEBHOOK_SECRET, signature, timestamp, legacyBodyOnly: true })) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  try {
    const start = Date.now();
    const payload = z.object({
      external_id: z.string(),
      user_id: z.string(),
      merchant_name: z.string(),
      mcc: z.string().optional(),
      amount_cents: z.number(),
      expires_at: z.string().optional(),
    }).parse(JSON.parse(rawBody));

    const eventStore = new EventStore();
    const rawEvent = await eventStore.recordRawEvent({
      source: 'column',
      event_type: 'auth_request',
      external_id: payload.external_id,
      user_id: payload.user_id,
      payload,
      signature,
      headers: { 'x-column-timestamp': timestamp ?? null },
    });

    const adapter = new ColumnAdapter();
    const response = await adapter.handleAuthRequest(payload, rawEvent.event.id);

    const metrics = new MetricsService();
    const receivedAt = new Date(rawEvent.event.received_at).getTime();
    await metrics.record({
      user_id: payload.user_id,
      name: 'webhook_lag_ms',
      value: Date.now() - receivedAt,
      metadata: { source: 'column', event_type: 'auth_request' },
    });
    await metrics.recordLatency('auth_decision_latency_ms', start, { source: 'column' }, payload.user_id);

    return res.status(200).json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return res.status(500).json({ error: message });
  }
}
