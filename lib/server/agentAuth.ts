import type { IncomingMessage } from 'http';
import { supabaseAdmin } from './supabaseAdmin';

function getAdminKey(req: IncomingMessage) {
  return (req.headers['x-admin-key'] || req.headers['x-admin-token']) as string | undefined;
}

export function isAdminRequest(req: IncomingMessage) {
  const configured = process.env.ADMIN_API_KEY || process.env.DEV_ADMIN_KEY;
  if (!configured) return false;
  const key = getAdminKey(req);
  return !!key && key === configured;
}

export async function requireAgentOrAdmin(req: IncomingMessage, userId: string, agentId?: string | null) {
  if (isAdminRequest(req)) {
    return { isAdmin: true, agent: null } as const;
  }

  if (!agentId) {
    throw new Error('Missing agent_id');
  }

  const { data, error } = await supabaseAdmin
    .from('agent_tokens')
    .select('*')
    .eq('user_id', userId)
    .eq('agent_id', agentId)
    .maybeSingle();

  if (error) throw error;
  if (!data || data.status !== 'active') {
    throw new Error('Unauthorized');
  }

  return { isAdmin: false, agent: data } as const;
}
