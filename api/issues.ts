import { IssueService } from '@/lib/engine/issues';
import { getUserIdFromRequest } from '@/lib/server/auth';
import { logAdapterSummary } from '@/lib/server/envSummary';

const VALID_CATEGORIES = new Set(['looks_wrong', 'fraud', 'dispute', 'error']);

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    logAdapterSummary();
    const userId = await getUserIdFromRequest(req);
    const service = new IssueService();

    if (req.method === 'GET') {
      const issues = await service.listIssues(userId);
      return res.status(200).json({ issues });
    }

    const { category, description, related_transaction_id, related_hold_id, evidence_json } = req.body || {};
    if (!category || !VALID_CATEGORIES.has(category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }
    if (!description || typeof description !== 'string') {
      return res.status(400).json({ error: 'Description is required' });
    }

    const issue = await service.createIssue(userId, {
      category,
      description,
      related_transaction_id: related_transaction_id ?? null,
      related_hold_id: related_hold_id ?? null,
      evidence_json: evidence_json ?? null,
    });

    return res.status(201).json({ issue });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return res.status(500).json({ error: message });
  }
}
