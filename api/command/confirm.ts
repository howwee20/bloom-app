import { CommandService } from '@/lib/engine/command';
import { getUserIdFromRequest } from '@/lib/server/auth';
import { logAdapterSummary } from '@/lib/server/envSummary';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    logAdapterSummary();
    const userId = await getUserIdFromRequest(req);
    const payload = req.body || {};
    if (!payload.action || !payload.idempotency_key) {
      return res.status(400).json({ error: 'Missing command payload' });
    }

    const command = new CommandService();
    const result = await command.confirm(userId, payload);
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return res.status(500).json({ error: message });
  }
}
