export function requireCronSecret(req: {
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
}) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return { ok: false, status: 500, error: 'CRON_SECRET not configured' };
  }

  const authorization = req.headers?.['authorization'];
  const authHeader = Array.isArray(authorization) ? authorization[0] : authorization;
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;

  const header = req.headers?.['x-cron-secret'];
  const provided = Array.isArray(header) ? header[0] : header;

  const queryParam = req.query?.['cron_secret'];
  const providedQuery = Array.isArray(queryParam) ? queryParam[0] : queryParam;
  const candidate = bearer || provided || providedQuery;
  if (!candidate || candidate !== secret) {
    return { ok: false, status: 401, error: 'Invalid cron secret' };
  }

  return { ok: true as const };
}
