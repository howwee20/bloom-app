import type { IncomingMessage } from 'http';
import { supabaseAdmin } from './supabaseAdmin';

export async function getUserIdFromRequest(req: IncomingMessage): Promise<string> {
  const headerUserId = (req.headers['x-user-id'] || req.headers['x-dev-user-id']) as string | undefined;
  if (headerUserId) return headerUserId;

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.replace('Bearer ', '') : '';
  if (token) {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      throw new Error('Unauthorized');
    }
    return data.user.id;
  }

  if (process.env.DEV_USER_ID) {
    return process.env.DEV_USER_ID;
  }

  throw new Error('Unauthorized');
}
