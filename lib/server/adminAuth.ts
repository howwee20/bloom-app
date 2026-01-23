import type { IncomingMessage } from 'http';

export function requireAdmin(req: IncomingMessage) {
  const key = req.headers['x-admin-key'] as string | undefined;
  const configured = process.env.ADMIN_API_KEY || process.env.DEV_ADMIN_KEY;
  if (!configured) {
    throw new Error('Missing ADMIN_API_KEY');
  }
  if (!key || key !== configured) {
    throw new Error('Unauthorized');
  }
  return true;
}
