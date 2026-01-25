import { supabaseAdmin } from '@/lib/server/supabaseAdmin';

export class CronLock {
  async acquire(lockKey: string, ttlSeconds: number, metadata?: Record<string, unknown>) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
    const nowIso = now.toISOString();

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('cron_locks')
      .update({
        locked_at: nowIso,
        expires_at: expiresAt.toISOString(),
        metadata_json: metadata ?? {},
      })
      .eq('lock_key', lockKey)
      .lt('expires_at', nowIso)
      .select('*')
      .maybeSingle();

    if (updateError) throw updateError;
    if (updated) {
      return { acquired: true, lock: updated };
    }

    const { data, error } = await supabaseAdmin
      .from('cron_locks')
      .insert({
        lock_key: lockKey,
        locked_at: nowIso,
        expires_at: expiresAt.toISOString(),
        metadata_json: metadata ?? {},
      })
      .select('*')
      .single();

    if (error) {
      const message = String(error.message || '').toLowerCase();
      if (error.code === '23505' || message.includes('duplicate')) {
        return { acquired: false };
      }
      throw error;
    }

    return { acquired: true, lock: data };
  }

  async release(lockKey: string) {
    const nowIso = new Date().toISOString();
    await supabaseAdmin
      .from('cron_locks')
      .update({ expires_at: nowIso })
      .eq('lock_key', lockKey);
  }
}
