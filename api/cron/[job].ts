import { CronLock } from '@/lib/engine/cronLock';
import { LiquidationEngine } from '@/lib/engine/liquidation';
import { ReconciliationService } from '@/lib/engine/reconcile';
import { requireCronSecret } from '@/lib/server/cronAuth';
import { listAllUserIds } from '@/lib/server/userAdmin';

const VALID_JOBS = new Set(['update-prices', 'liquidate', 'reconcile']);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = requireCronSecret(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const job = Array.isArray(req.query?.job) ? req.query.job[0] : req.query?.job;
  if (!job || !VALID_JOBS.has(job)) {
    return res.status(404).json({ error: 'Unknown cron job' });
  }

  const startedAt = Date.now();
  const lock = new CronLock();
  const lockKey = `cron:${job}`;
  const ttlSeconds = job === 'liquidate' ? 90 : job === 'reconcile' ? 180 : 300;

  let acquired = false;

  try {
    const lockResult = await lock.acquire(lockKey, ttlSeconds, { path: `/api/cron/${job}` });
    if (!lockResult.acquired) {
      console.log(JSON.stringify({ event: 'cron_skip', job, lock_key: lockKey }));
      return res.status(200).json({ ok: true, skipped: true, job });
    }
    acquired = true;

    console.log(JSON.stringify({ event: 'cron_start', job, lock_key: lockKey }));

    if (job === 'update-prices') {
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

      const durationMs = Date.now() - startedAt;
      console.log(JSON.stringify({ event: 'cron_done', job, duration_ms: durationMs }));
      return res.status(response.ok ? 200 : 500).json({
        ok: data.ok === true,
        job,
        duration_ms: durationMs,
        processed: data.processed || 0,
        updated: data.updated || 0,
        failed: data.failed || 0,
        nextCursor: data.nextCursor || null,
        error: data.ok === true ? null : data.error || 'Update failed',
      });
    }

    if (job === 'liquidate') {
      const userIds = req.query.user_id ? [String(req.query.user_id)] : await listAllUserIds();
      const engine = new LiquidationEngine();

      for (const userId of userIds) {
        await engine.enqueueIfNeeded(userId);
      }
      await engine.processQueued(25);

      const durationMs = Date.now() - startedAt;
      console.log(JSON.stringify({ event: 'cron_done', job, duration_ms: durationMs }));
      return res.status(200).json({ ok: true, job, users_processed: userIds.length, duration_ms: durationMs });
    }

    if (job === 'reconcile') {
      const userIds = req.query.user_id ? [String(req.query.user_id)] : await listAllUserIds();
      const service = new ReconciliationService();
      const reports = [];

      for (const userId of userIds) {
        const report = await service.reconcileUser(userId);
        reports.push(report);
      }

      const durationMs = Date.now() - startedAt;
      console.log(JSON.stringify({ event: 'cron_done', job, duration_ms: durationMs }));
      return res.status(200).json({ ok: true, job, users_processed: userIds.length, duration_ms: durationMs, reports });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    console.error(JSON.stringify({ event: 'cron_error', job, message }));
    return res.status(500).json({ error: message });
  } finally {
    if (acquired) {
      await lock.release(lockKey);
    }
  }

  return res.status(500).json({ error: 'Unhandled cron job' });
}
