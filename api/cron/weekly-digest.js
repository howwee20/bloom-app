// Weekly digest cron endpoint (secure)

export default async function handler(req, res) {
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

    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/generate_weekly_digests`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const data = await response.json();
    const payload = {
      job_name: 'weekly-digest',
      last_run_at: new Date().toISOString(),
      last_status: response.ok ? 'success' : 'error',
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
      ok: response.ok,
      processed: Array.isArray(data) ? data[0] : data,
      durationMs: null,
    });
  } catch (error) {
    console.error('Weekly digest error:', error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
