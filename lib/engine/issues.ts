import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { ExternalLinkService } from './externalLinks';
import { isUnitConfigured } from './integrations/unitClient';

type IssueCategory = 'looks_wrong' | 'fraud' | 'dispute' | 'error';
type IssueStatus = 'opened' | 'triaging' | 'submitted' | 'waiting' | 'resolved';

type IssueInput = {
  category: IssueCategory;
  description: string;
  related_transaction_id?: string | null;
  related_hold_id?: string | null;
  evidence_json?: Record<string, unknown> | null;
};

export class IssueService {
  private externalLinks = new ExternalLinkService();

  private async requestCardFreeze(userId: string, reason: string) {
    const link = await this.externalLinks.getLink(userId, 'unit');
    if (!link?.card_id) {
      return { ok: false, status: 'not_linked' as const };
    }
    if (!isUnitConfigured()) {
      return { ok: false, status: 'not_configured' as const };
    }

    // TODO: Replace stub with Unit card freeze endpoint when available in API docs.
    await supabaseAdmin.from('admin_actions').insert({
      actor: 'system',
      action: 'unit_card_freeze_requested',
      target_user_id: userId,
      metadata: { card_id: link.card_id, reason },
    });

    return { ok: false, status: 'stubbed' as const };
  }

  private async requestCardUnfreeze(userId: string, reason: string) {
    const link = await this.externalLinks.getLink(userId, 'unit');
    if (!link?.card_id) {
      return { ok: false, status: 'not_linked' as const };
    }
    if (!isUnitConfigured()) {
      return { ok: false, status: 'not_configured' as const };
    }

    // TODO: Replace stub with Unit card unfreeze endpoint when available in API docs.
    await supabaseAdmin.from('admin_actions').insert({
      actor: 'system',
      action: 'unit_card_unfreeze_requested',
      target_user_id: userId,
      metadata: { card_id: link.card_id, reason },
    });

    return { ok: false, status: 'stubbed' as const };
  }

  async createIssue(userId: string, input: IssueInput) {
    const payload = {
      user_id: userId,
      category: input.category,
      status: 'opened' as IssueStatus,
      related_transaction_id: input.related_transaction_id ?? null,
      related_hold_id: input.related_hold_id ?? null,
      description: input.description,
      evidence_json: input.evidence_json ?? {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('issues')
      .insert(payload)
      .select('*')
      .single();
    if (error) throw error;

    if (input.category === 'fraud') {
      const freeze = await this.requestCardFreeze(userId, input.description);
      await supabaseAdmin
        .from('issues')
        .update({
          evidence_json: {
            ...(payload.evidence_json || {}),
            card_freeze_status: freeze.status,
          },
        })
        .eq('issue_id', data.issue_id);
    }

    return data;
  }

  async listIssues(userId: string) {
    const { data, error } = await supabaseAdmin
      .from('issues')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async updateIssueStatus(issueId: string, status: IssueStatus, reason?: string | null) {
    const { data: issue, error: issueError } = await supabaseAdmin
      .from('issues')
      .select('*')
      .eq('issue_id', issueId)
      .single();
    if (issueError || !issue) throw issueError || new Error('Issue not found');

    const { data, error } = await supabaseAdmin
      .from('issues')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('issue_id', issueId)
      .select('*')
      .single();
    if (error || !data) throw error;

    if (status === 'resolved' && issue.category === 'fraud') {
      const unfreeze = await this.requestCardUnfreeze(issue.user_id, reason || 'Issue resolved');
      await supabaseAdmin
        .from('issues')
        .update({
          evidence_json: {
            ...(issue.evidence_json || {}),
            card_unfreeze_status: unfreeze.status,
          },
        })
        .eq('issue_id', issueId);
    }

    return data;
  }
}
