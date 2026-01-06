-- Migration: Update price cron to run every 10 minutes (was 4 hours)
-- This makes the portfolio feel "alive" with real-time updates

-- First, unschedule the existing job (if it exists)
SELECT cron.unschedule('update-stockx-prices');

-- Schedule the new job to run every 10 minutes
-- Cron syntax: '*/10 * * * *' = every 10 minutes
SELECT cron.schedule(
  'update-stockx-prices',      -- job name
  '*/10 * * * *',              -- every 10 minutes
  $$SELECT trigger_price_update()$$
);

-- Also create a function to sync token prices from assets (SKU-based)
-- This ensures home tokens (without order_id) also get price updates
CREATE OR REPLACE FUNCTION sync_token_prices_from_assets()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Update token current_value from the corresponding asset's price (by SKU match)
  UPDATE tokens t
  SET
    current_value = a.price,
    value_updated_at = NOW()
  FROM assets a
  WHERE t.sku = a.stockx_sku
    AND t.status IN ('pending', 'active', 'listed', 'in_custody', 'acquiring', 'shipping_to_bloom');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Grant execute to service role
GRANT EXECUTE ON FUNCTION sync_token_prices_from_assets() TO service_role;

-- Update the trigger_price_update function to also sync tokens
CREATE OR REPLACE FUNCTION trigger_price_update()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  supabase_url TEXT;
  service_key TEXT;
BEGIN
  -- Get the Supabase URL and service key from settings
  supabase_url := current_setting('app.settings.supabase_url', true);
  service_key := current_setting('app.settings.service_role_key', true);

  -- Call the Edge Function using pg_net to update asset prices
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/update-prices/all',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || service_key,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );

  -- Sync token prices from assets (by SKU match)
  PERFORM sync_token_prices_from_assets();

  RAISE NOTICE 'Price update triggered at %', NOW();
END;
$$;
