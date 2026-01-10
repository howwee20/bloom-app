-- Migration: price_refresh_jobs partial + skipped counts

ALTER TABLE public.price_refresh_jobs
  ADD COLUMN IF NOT EXISTS skipped_count INTEGER DEFAULT 0;

-- Normalize any existing statuses
UPDATE public.price_refresh_jobs
SET status = CASE
  WHEN status = 'succeeded' THEN 'success'
  WHEN status = 'failed' THEN 'error'
  ELSE status
END
WHERE status IN ('succeeded', 'failed');

-- Update status constraint to include partial
ALTER TABLE public.price_refresh_jobs
  DROP CONSTRAINT IF EXISTS price_refresh_jobs_status_check;

ALTER TABLE public.price_refresh_jobs
  ADD CONSTRAINT price_refresh_jobs_status_check
  CHECK (status IN ('running', 'success', 'partial', 'error', 'auth_failed'));

-- Last successful pricing now includes partial
CREATE OR REPLACE FUNCTION get_last_successful_price_update()
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_timestamp TIMESTAMPTZ;
BEGIN
  SELECT finished_at INTO v_timestamp
  FROM public.price_refresh_jobs
  WHERE status IN ('success', 'partial') AND finished_at IS NOT NULL
  ORDER BY finished_at DESC
  LIMIT 1;

  RETURN v_timestamp;
END;
$$;

GRANT EXECUTE ON FUNCTION get_last_successful_price_update() TO authenticated;
GRANT EXECUTE ON FUNCTION get_last_successful_price_update() TO service_role;
