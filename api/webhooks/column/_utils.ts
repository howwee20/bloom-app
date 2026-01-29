import type { IncomingMessage } from 'http';

export async function readRawBody(
  req: IncomingMessage & { rawBody?: Buffer | string; body?: unknown }
): Promise<string> {
  const rawBody = req.rawBody ?? req.body;
  if (typeof rawBody === 'string') return rawBody;
  if (Buffer.isBuffer(rawBody)) return rawBody.toString('utf8');

  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
