import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import type { ReceiptInput } from './types';

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
      type: 'auth_hold',
      title: merchant,
      subtitle: 'Card authorization',
      amount_cents: -Math.abs(amountCents),
      metadata: {
        external_id: externalId,
        what_happened: 'Card authorization placed.',
        what_changed: 'Spendable reduced until settlement.',
        whats_next: 'Hold will settle or release shortly.',
      },
    });
  }

  async recordSettlement(userId: string, merchant: string, amountCents: number, externalId: string) {
    return this.recordReceipt({
      user_id: userId,
      type: 'settlement',
      title: merchant,
      subtitle: 'Settlement posted',
      amount_cents: -Math.abs(amountCents),
      metadata: {
        external_id: externalId,
        what_happened: 'Card settlement posted.',
        what_changed: 'Cash balance decreased.',
        whats_next: 'Receipt is final.',
      },
    });
  }

  async recordDeposit(userId: string, amountCents: number, externalId: string) {
    return this.recordReceipt({
      user_id: userId,
      type: 'deposit_posted',
      title: 'Deposit',
      subtitle: 'Funds added',
      amount_cents: Math.abs(amountCents),
      metadata: {
        external_id: externalId,
        what_happened: 'Deposit posted.',
        what_changed: 'Cash balance increased.',
        whats_next: 'Funds are spendable now.',
      },
    });
  }

  async recordTradeFill(userId: string, title: string, amountCents: number, side: 'buy' | 'sell', externalId: string) {
    return this.recordReceipt({
      user_id: userId,
      type: 'trade_filled',
      title,
      subtitle: side === 'buy' ? 'Trade filled' : 'Trade sold',
      amount_cents: side === 'buy' ? -Math.abs(amountCents) : Math.abs(amountCents),
      metadata: {
        external_id: externalId,
        side,
        what_happened: 'Trade filled.',
        what_changed: side === 'buy' ? 'Cash moved into investments.' : 'Cash released from holdings.',
        whats_next: 'Holdings updated.',
      },
    });
  }
}
