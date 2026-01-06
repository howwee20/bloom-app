// Vercel Cron Job: Update prices every 10 minutes
// This calls the Supabase edge function to sync StockX prices

export default async function handler(req, res) {
  // Only allow GET requests (cron uses GET)
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const secret = process.env.CRON_SECRET;
    const providedSecret = req.headers['x-cron-secret'] || req.query.secret;

    if (!secret || providedSecret !== secret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      throw new Error('Missing Supabase credentials');
    }

    const limit = Number(req.query.limit) || 20;
    const cursor = req.query.cursor || null;

    const response = await fetch(`${supabaseUrl}/functions/v1/update-prices/all`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ limit, cursor }),
    });

    const data = await response.json();
    const payload = {
      job_name: 'update-prices',
      last_run_at: new Date().toISOString(),
      last_status: data.ok ? 'success' : 'error',
      last_payload: data,
    };

    await fetch(`${supabaseUrl}/rest/v1/cron_status?on_conflict=job_name`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify([payload]),
    });

    return res.status(response.ok ? 200 : 500).json({
      ok: data.ok === true,
      timestamp: new Date().toISOString(),
      processed: data.processed || 0,
      updated: data.updated || 0,
      failed: data.failed || 0,
      nextCursor: data.nextCursor || null,
      durationMs: data.durationMs || null,
      error: data.ok === true ? null : data.error || 'Update failed',
    });
  } catch (error) {
    console.error('Price update error:', error);
    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
}
