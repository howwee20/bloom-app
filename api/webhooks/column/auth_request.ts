import { ColumnAdapter, verifyColumnSignature } from '@/lib/engine/integrations/column';
import { readRawBody } from './_utils';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawBody = await readRawBody(req);
  const signature = req.headers['x-column-signature'] as string | undefined;
  if (!verifyColumnSignature(rawBody, signature)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  try {
    const payload = JSON.parse(rawBody);
    const adapter = new ColumnAdapter();
    const response = await adapter.handleAuthRequest(payload);
    return res.status(200).json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return res.status(500).json({ error: message });
  }
}
