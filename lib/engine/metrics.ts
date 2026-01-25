import { supabaseAdmin } from '@/lib/server/supabaseAdmin';

type MetricInput = {
  user_id?: string | null;
  name: string;
  value: number;
  metadata?: Record<string, unknown>;
};

export class MetricsService {
  async record(input: MetricInput) {
    try {
      const { error } = await supabaseAdmin
        .from('metrics_snapshots')
        .insert({
          user_id: input.user_id ?? null,
          metric_name: input.name,
          metric_value: input.value,
          metadata_json: input.metadata ?? {},
        });

      if (error) {
        console.warn('[Metrics] insert failed', error);
      }
    } catch (error) {
      console.warn('[Metrics] insert failed', error);
    }
  }

  async recordLatency(name: string, startedAtMs: number, metadata?: Record<string, unknown>, userId?: string | null) {
    const value = Date.now() - startedAtMs;
    return this.record({ name, value, metadata, user_id: userId ?? null });
  }

  async recordCount(name: string, count = 1, metadata?: Record<string, unknown>, userId?: string | null) {
    return this.record({ name, value: count, metadata, user_id: userId ?? null });
  }
}
