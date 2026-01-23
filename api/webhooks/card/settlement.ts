import { z } from 'zod';
import { EventStore } from '@/lib/engine/eventStore';
import { getCardProcessorAdapter } from '@/lib/engine/adapters/cardProcessor';
import { checkRateLimit } from '@/lib/server/rateLimit';
import { verifyWebhookSignature } from '@/lib/server/webhook';
import { logAdapterSummary } from '@/lib/server/envSummary';
import { readRawBody } from '../column/_utils';

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

  const rateKey = `${req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown'}:card:settlement`;
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
    const payload = z.object({
      external_id: z.string(),
      user_id: z.string(),
      merchant_name: z.string(),
      amount_cents: z.number(),
      auth_id: z.string().optional(),
    }).parse(JSON.parse(rawBody));

    const eventStore = new EventStore();
    const rawEvent = await eventStore.recordRawEvent({
      source: 'card_processor',
      event_type: 'settlement',
      external_id: payload.external_id,
      user_id: payload.user_id,
      payload,
      signature,
      headers: { 'x-card-timestamp': timestamp ?? null },
    });

    const adapter = getCardProcessorAdapter();
    await adapter.handleSettlementWebhook(payload, rawEvent.event.id);

    return res.status(200).json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return res.status(500).json({ error: message });
  }
}
