import { IssueService } from '@/lib/engine/issues';
import { requireAdmin } from '@/lib/server/adminAuth';
import { logAdapterSummary } from '@/lib/server/envSummary';

const VALID_STATUSES = new Set(['opened', 'triaging', 'submitted', 'waiting', 'resolved']);

export default async function handler(req: any, res: any) {
  if (req.method !== 'PATCH' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    logAdapterSummary();
    requireAdmin(req);

    const issueId = Array.isArray(req.query?.id) ? req.query.id[0] : req.query?.id;
    if (!issueId) {
      return res.status(400).json({ error: 'Missing issue id' });
    }

    const { status, reason } = req.body || {};
    if (!status || !VALID_STATUSES.has(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const service = new IssueService();
    const issue = await service.updateIssueStatus(issueId, status, reason ?? null);
    return res.status(200).json({ issue });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return res.status(500).json({ error: message });
  }
}
