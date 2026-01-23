import { supabaseAdmin } from '@/lib/server/supabaseAdmin';

export async function listAllUserIds(): Promise<string[]> {
  const ids: string[] = [];
  const perPage = 1000;
  let page = 1;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users ?? [];
    ids.push(...users.map((user) => user.id));

    if (users.length < perPage) break;
    page += 1;
    if (page > 50) break; // safety guard
  }

  return ids;
}
