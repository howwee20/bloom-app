-- Migration: Fix get_last_successful_price_update to consider partial updates as "fresh"
--
-- Problem: Wallet shows "Prices paused" even when prices ARE updating
-- Cause: Jobs marked 'failed' when ANY item fails, but RPC only returned 'succeeded' jobs
-- Fix: Consider any job with updated_count > 0 as "fresh enough" for wallet header

CREATE OR REPLACE FUNCTION public.get_last_successful_price_update()
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_timestamp TIMESTAMPTZ;
BEGIN
  -- Any job that updated at least one price is considered "successful" for freshness
  -- This handles:
  --   'succeeded' = all items updated
  --   'partial' = some items updated, some failed/skipped
  --   items_updated > 0 or updated_count > 0 = fallback for any status with updates
  SELECT finished_at INTO v_timestamp
  FROM public.price_refresh_jobs
  WHERE finished_at IS NOT NULL
    AND (
      status IN ('succeeded', 'partial')
      OR COALESCE(items_updated, 0) > 0
      OR COALESCE(updated_count, 0) > 0
    )
  ORDER BY finished_at DESC
  LIMIT 1;

  RETURN v_timestamp;
END;
$$;

-- Ensure permissions
GRANT EXECUTE ON FUNCTION public.get_last_successful_price_update() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_last_successful_price_update() TO service_role;
