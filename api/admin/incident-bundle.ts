import { buildIncidentBundle } from '@/lib/engine/incidentBundle';
import { requireAdmin } from '@/lib/server/adminAuth';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    requireAdmin(req);
    const userId = req.query.user_id ? String(req.query.user_id) : null;
    if (!userId) {
      return res.status(400).json({ error: 'Missing user_id' });
    }

    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const bundle = await buildIncidentBundle(userId, Number.isFinite(limit) ? limit : 20);
    return res.status(200).json(bundle);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return res.status(500).json({ error: message });
  }
}
