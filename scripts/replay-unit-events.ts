import 'dotenv/config';
import { supabaseAdmin } from '../lib/server/supabaseAdmin';
import { SpendPowerEngine } from '../lib/engine/spendPower';
import { SpendPowerKernel } from '../lib/engine/spendPowerKernel';
import { normalizeUnitEvent, type UnitEventData, type UnitWebhookEnvelope } from '../providers/unit';

async function run() {
  const userId = process.env.DEV_USER_ID || process.argv[2];
  if (!userId) {
    throw new Error('Missing DEV_USER_ID or user id argument');
  }

  await supabaseAdmin.from('auth_holds').delete().eq('user_id', userId);
  await supabaseAdmin.from('transactions').delete().eq('user_id', userId);
  await supabaseAdmin.from('spend_power_snapshots').delete().eq('user_id', userId);
  await supabaseAdmin.from('receipts').delete().eq('user_id', userId).eq('source', 'unit_event');

  const { data: rawEvents, error } = await supabaseAdmin
    .from('raw_events')
    .select('*')
    .eq('provider', 'unit')
    .eq('user_id', userId)
    .order('occurred_at', { ascending: true });
  if (error) throw error;

  const kernel = new SpendPowerKernel();
  const processRawEvent = async (rawEvent: any) => {
    const envelope = (rawEvent.payload as UnitWebhookEnvelope).data
      ? rawEvent.payload as UnitWebhookEnvelope
      : { data: rawEvent.payload as UnitEventData };
    const normalized = normalizeUnitEvent(envelope);
    if (!normalized) {
      await supabaseAdmin
        .from('raw_events')
        .update({ processed_at: new Date().toISOString(), processing_error: null })
        .eq('id', rawEvent.id);
      return;
    }
    await kernel.processEvent({
      ...normalized,
      rawEventId: rawEvent.id,
      userId: rawEvent.user_id ?? normalized.userId,
    });
  };

  for (const rawEvent of rawEvents || []) {
    await processRawEvent(rawEvent);
  }

  const engine = new SpendPowerEngine();
  const first = await engine.calculateSpendPower(userId);

  for (const rawEvent of rawEvents || []) {
    await processRawEvent(rawEvent);
  }

  const second = await engine.calculateSpendPower(userId);

  if (first.spend_power_cents !== second.spend_power_cents) {
    throw new Error(`Spend power mismatch after replay: ${first.spend_power_cents} vs ${second.spend_power_cents}`);
  }

  console.log('Replay complete. Spend power is deterministic.');
  console.log('Spend power:', first.spend_power_cents);
}

run().catch((error) => {
  console.error('Replay failed:', error);
  process.exit(1);
});
