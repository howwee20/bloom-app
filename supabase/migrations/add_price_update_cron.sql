-- Migration: Set up pg_cron for automatic price updates every 4 hours
-- Note: pg_cron must be enabled in Supabase Dashboard > Database > Extensions

-- Enable the pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable pg_net for HTTP requests from SQL (required to call Edge Functions)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Grant usage on cron schema
GRANT USAGE ON SCHEMA cron TO postgres;

-- Create a function to trigger the price update Edge Function
CREATE OR REPLACE FUNCTION trigger_price_update()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url TEXT;
  service_key TEXT;
BEGIN
  -- Get the Supabase URL and service key from vault (recommended)
  -- Or hardcode them here (less secure but simpler for dev)
  supabase_url := current_setting('app.settings.supabase_url', true);
  service_key := current_setting('app.settings.service_role_key', true);

  -- Call the Edge Function using pg_net
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/update-prices/all',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || service_key,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );

  RAISE NOTICE 'Price update triggered at %', NOW();
END;
$$;

-- Schedule the cron job to run every 4 hours
-- Cron syntax: minute hour day month weekday
-- '0 */4 * * *' = at minute 0, every 4th hour, every day
SELECT cron.schedule(
  'update-stockx-prices',      -- job name
  '0 */4 * * *',               -- every 4 hours
  $$SELECT trigger_price_update()$$
);

-- Alternative: Run at specific times (e.g., 6am, 10am, 2pm, 6pm, 10pm)
-- SELECT cron.schedule(
--   'update-stockx-prices',
--   '0 6,10,14,18,22 * * *',
--   $$SELECT trigger_price_update()$$
-- );

-- View scheduled jobs
-- SELECT * FROM cron.job;

-- To unschedule the job:
-- SELECT cron.unschedule('update-stockx-prices');

-- Create a table to log price update runs
CREATE TABLE IF NOT EXISTS public.price_update_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  assets_updated INTEGER DEFAULT 0,
  status TEXT DEFAULT 'running',
  error_message TEXT
);

-- Enable RLS on price_update_log
ALTER TABLE public.price_update_log ENABLE ROW LEVEL SECURITY;

-- Policy: Only service role can manage logs
CREATE POLICY "Service role can manage price update logs"
ON public.price_update_log
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Policy: Authenticated users can view logs
CREATE POLICY "Authenticated users can view price update logs"
ON public.price_update_log
FOR SELECT
TO authenticated
USING (true);
