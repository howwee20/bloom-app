import { supabaseAdmin } from '@/lib/server/supabaseAdmin';

export type ExternalLink = {
  id: string;
  user_id: string;
  provider: string;
  entity_id: string | null;
  bank_account_id: string | null;
  card_id: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
};

export class ExternalLinkService {
  async getLink(userId: string, provider = 'column'): Promise<ExternalLink | null> {
    const { data, error } = await supabaseAdmin
      .from('external_links')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', provider)
      .maybeSingle();

    if (error) throw error;
    return data as ExternalLink | null;
  }

  async upsertLink(input: {
    user_id: string;
    provider: string;
    entity_id?: string | null;
    bank_account_id?: string | null;
    card_id?: string | null;
    metadata_json?: Record<string, unknown>;
  }) {
    const { data, error } = await supabaseAdmin
      .from('external_links')
      .upsert({
        user_id: input.user_id,
        provider: input.provider,
        entity_id: input.entity_id ?? null,
        bank_account_id: input.bank_account_id ?? null,
        card_id: input.card_id ?? null,
        metadata_json: input.metadata_json ?? {},
      }, { onConflict: 'user_id,provider' })
      .select('*')
      .single();

    if (error) throw error;
    return data as ExternalLink;
  }
}
