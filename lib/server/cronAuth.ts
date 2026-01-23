export function requireCronSecret(req: { headers?: Record<string, string | string[] | undefined> }) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return { ok: false, status: 500, error: 'CRON_SECRET not configured' };
  }

  const header = req.headers?.['x-cron-secret'];
  const provided = Array.isArray(header) ? header[0] : header;
  if (!provided || provided !== secret) {
    return { ok: false, status: 401, error: 'Invalid cron secret' };
  }

  return { ok: true as const };
}
