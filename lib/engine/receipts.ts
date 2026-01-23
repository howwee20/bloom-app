import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import type { ReceiptInput } from './types';
import { receiptCatalog } from './receiptCatalog';

export class ReceiptBuilder {
  async recordReceipt(input: ReceiptInput) {
    const rawExternalId = input.metadata && 'external_id' in input.metadata
      ? (input.metadata as { external_id?: string | number }).external_id
      : null;
    const externalId = rawExternalId ? String(rawExternalId) : null;

    if (externalId) {
      const { data: existing, error: existingError } = await supabaseAdmin
        .from('receipts')
        .select('*')
        .eq('user_id', input.user_id)
        .eq('type', input.type)
        .contains('metadata_json', { external_id: externalId })
        .maybeSingle();

      if (existingError) throw existingError;
      if (existing) return existing;
    }

    const payload = {
      user_id: input.user_id,
      type: input.type,
      title: input.title,
      subtitle: input.subtitle ?? null,
      amount_cents: input.amount_cents,
      occurred_at: input.occurred_at ?? new Date().toISOString(),
      metadata_json: input.metadata ?? {},
    };

    const { data, error } = await supabaseAdmin
      .from('receipts')
      .insert(payload)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  }

  async recordAuthHold(userId: string, merchant: string, amountCents: number, externalId: string) {
    return this.recordReceipt({
      user_id: userId,
      ...receiptCatalog.cardAuthHold({
        merchant,
        amount_cents: amountCents,
        external_id: externalId,
      }),
    });
  }

  async recordSettlement(userId: string, merchant: string, amountCents: number, externalId: string) {
    return this.recordReceipt({
      user_id: userId,
      ...receiptCatalog.cardSettlement({
        merchant,
        amount_cents: amountCents,
        external_id: externalId,
      }),
    });
  }

  async recordDeposit(userId: string, amountCents: number, externalId: string) {
    return this.recordReceipt({
      user_id: userId,
      ...receiptCatalog.achPosted({
        direction: 'credit',
        amount_cents: amountCents,
        external_id: externalId,
      }),
    });
  }

  async recordTradeFill(userId: string, title: string, amountCents: number, side: 'buy' | 'sell', externalId: string) {
    return this.recordReceipt({
      user_id: userId,
      ...receiptCatalog.tradeFilled({
        symbol: title,
        amount_cents: amountCents,
        side,
        external_id: externalId,
      }),
    });
  }
}
