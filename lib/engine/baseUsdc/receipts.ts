import { supabaseAdmin } from '@/lib/server/supabaseAdmin';

type ReceiptInput = {
  userId: string;
  source: 'onchain' | 'execution' | 'policy' | 'repair';
  type: string;
  title: string;
  subtitle?: string | null;
  amountCents: number;
  occurredAt: string;
  txHash?: string | null;
  providerEventId?: string | null;
  deltaSpendPowerCents?: number | null;
  whatHappened: string;
  whyChanged: string;
  whatHappensNext: string;
  metadata?: Record<string, unknown>;
};

export class BaseUsdcReceiptService {
  async recordReceipt(input: ReceiptInput) {
    if (input.providerEventId) {
      const { data: existing, error } = await supabaseAdmin
        .from('receipts')
        .select('id')
        .eq('user_id', input.userId)
        .eq('source', input.source)
        .eq('provider_event_id', input.providerEventId)
        .maybeSingle();
      if (error) throw error;
      if (existing) return existing;
    }

    const payload = {
      user_id: input.userId,
      type: input.type,
      title: input.title,
      subtitle: input.subtitle ?? null,
      amount_cents: Math.abs(Math.round(input.amountCents)),
      occurred_at: input.occurredAt,
      metadata_json: input.metadata ?? {},
      source: input.source,
      provider_event_id: input.providerEventId ?? null,
      delta_spend_power_cents: input.deltaSpendPowerCents ?? null,
      what_happened: input.whatHappened,
      why_changed: input.whyChanged,
      what_happens_next: input.whatHappensNext,
      tx_hash: input.txHash ?? null,
    };

    const { data, error } = await supabaseAdmin
      .from('receipts')
      .insert(payload)
      .select('id')
      .single();
    if (error) throw error;
    return data;
  }
}
