import { CommandService } from '@/lib/engine/command';
import { getUserIdFromRequest } from '@/lib/server/auth';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await getUserIdFromRequest(req);
    const { text } = req.body || {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Missing text' });
    }

    const command = new CommandService();
    const preview = command.parse(text);
    return res.status(200).json(preview);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return res.status(500).json({ error: message });
  }
}
