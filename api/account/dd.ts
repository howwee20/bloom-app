import { AccountService } from '@/lib/engine/account';
import { getUserIdFromRequest } from '@/lib/server/auth';
import { logAdapterSummary } from '@/lib/server/envSummary';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    logAdapterSummary();
    const userId = await getUserIdFromRequest(req);
    const account = new AccountService();
    const details = await account.getDirectDepositDetails(userId);
    return res.status(200).json(details);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return res.status(500).json({ error: message });
  }
}
