// supabase/functions/select-daily-winner/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Hono } from 'https://deno.land/x/hono@v3.7.4/mod.ts'
import { cors } from 'https://esm.sh/hono@v3.7.4/cors'

const app = new Hono()
app.use('*', cors()) // Enable CORS

app.post('/', async (c) => {
  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('MY_ADMIN_KEY')! // Use our new custom variable
    )

    // 1. Get "yesterday's" date string (e.g., '2025-11-04')
    // This is the date the prize is FOR.
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDateString = yesterday.toISOString().split('T')[0];

    // 2. Call our new, super-fast SQL function
    const { data: winnerId, error } = await supabaseAdmin
      .rpc('select_daily_winner_sql', {
        prize_date: yesterdayDateString
      });

    if (error) throw error;

    return c.json({ message: 'Winner selected!', winner: winnerId });

  } catch (error) {
    console.error('Error selecting daily winner:', error);
    return c.json({ error: error.message }, 500);
  }
})

export default app.fetch
