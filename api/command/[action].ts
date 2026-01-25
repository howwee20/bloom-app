import { CommandService } from '@/lib/engine/command';
import { getUserIdFromRequest } from '@/lib/server/auth';
import { logAdapterSummary } from '@/lib/server/envSummary';

const VALID_ACTIONS = new Set(['preview', 'confirm', 'execute']);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const action = Array.isArray(req.query?.action) ? req.query.action[0] : req.query?.action;
  if (!action || !VALID_ACTIONS.has(action)) {
    return res.status(404).json({ error: 'Unknown command action' });
  }

  try {
    logAdapterSummary();
    const userId = await getUserIdFromRequest(req);
    const command = new CommandService();

    if (action === 'preview') {
      const { text } = req.body || {};
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ error: 'Missing text' });
      }
      const preview = await command.preview(userId, text);
      return res.status(200).json(preview);
    }

    const payload = req.body || {};
    if (!payload.action || !payload.idempotency_key) {
      return res.status(400).json({ error: 'Missing command payload' });
    }

    const result = await command.confirm(userId, payload);
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return res.status(500).json({ error: message });
  }
}
