import { supabaseAdmin } from '@/lib/server/supabaseAdmin';

export type RpcHealthStatus = 'fresh' | 'stale' | 'unknown';

function resolveThreshold(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function computeRpcHealthStatus(ageSeconds: number | null): RpcHealthStatus {
  if (ageSeconds === null) return 'unknown';
  const freshMax = resolveThreshold('FRESH_SECONDS', 60);
  const staleMax = resolveThreshold('STALE_SECONDS', 300);
  const unknownMax = resolveThreshold('UNKNOWN_SECONDS', 900);

  if (ageSeconds <= freshMax) return 'fresh';
  if (ageSeconds <= staleMax) return 'stale';
  if (ageSeconds <= unknownMax) return 'unknown';
  return 'unknown';
}

export async function upsertRpcHealth(providerName: string, headTime: string, headBlock: number) {
  const now = new Date();
  const headDate = new Date(headTime);
  const ageSeconds = Math.max(0, (now.getTime() - headDate.getTime()) / 1000);
  const status = computeRpcHealthStatus(ageSeconds);

  await supabaseAdmin
    .from('rpc_health')
    .upsert({
      provider_name: providerName,
      status,
      last_ok_at: now.toISOString(),
      last_head_block: headBlock,
      last_head_time: headTime,
      updated_at: now.toISOString(),
    }, { onConflict: 'provider_name' });

  return { status, ageSeconds };
}

export async function markRpcFailure(providerName: string) {
  const { data, error } = await supabaseAdmin
    .from('rpc_health')
    .select('last_ok_at')
    .eq('provider_name', providerName)
    .maybeSingle();

  if (error) throw error;

  let status: RpcHealthStatus = 'unknown';
  if (data?.last_ok_at) {
    const ageSeconds = Math.max(0, (Date.now() - new Date(data.last_ok_at).getTime()) / 1000);
    status = computeRpcHealthStatus(ageSeconds);
    if (status === 'fresh') status = 'stale';
  }

  await supabaseAdmin
    .from('rpc_health')
    .upsert({
      provider_name: providerName,
      status,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'provider_name' });

  return status;
}
