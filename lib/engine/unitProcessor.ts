import { supabaseAdmin } from '@/lib/server/supabaseAdmin';
import { SpendPowerKernel } from './spendPowerKernel';
import { normalizeUnitEvent, type UnitEventData, type UnitWebhookEnvelope } from '@/providers/unit';

// Deprecated: UnitEventProcessor now proxies to SpendPowerKernel + providers/unit.

type RawEventRow = {
  id: string;
  payload: UnitWebhookEnvelope | UnitEventData;
  user_id?: string | null;
};

export class UnitEventProcessor {
  private kernel = new SpendPowerKernel();

  async processRawEvent(rawEvent: RawEventRow): Promise<{ userId: string | null }> {
    const envelope = (rawEvent.payload as UnitWebhookEnvelope).data
      ? rawEvent.payload as UnitWebhookEnvelope
      : { data: rawEvent.payload as UnitEventData };

    let normalizedEvent: ReturnType<typeof normalizeUnitEvent>;
    try {
      normalizedEvent = normalizeUnitEvent(envelope);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unit event normalization failed';
      await supabaseAdmin
        .from('raw_events')
        .update({ processing_error: message })
        .eq('id', rawEvent.id);
      throw error;
    }

    if (!normalizedEvent) {
      await supabaseAdmin
        .from('raw_events')
        .update({ processed_at: new Date().toISOString(), processing_error: null })
        .eq('id', rawEvent.id);
      return { userId: rawEvent.user_id ?? null };
    }

    return this.kernel.processEvent({
      ...normalizedEvent,
      rawEventId: rawEvent.id,
      userId: rawEvent.user_id ?? normalizedEvent.userId,
    });
  }
}
