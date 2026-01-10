-- Migration: Price Refresh Jobs Tracking
-- Tracks each price refresh job run for observability and debugging

-- ============================================
-- 1. CREATE PRICE_REFRESH_JOBS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.price_refresh_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed', 'auth_failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  items_targeted INTEGER DEFAULT 0,
  items_updated INTEGER DEFAULT 0,
  items_failed INTEGER DEFAULT 0,
  error TEXT,
  error_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying recent jobs
CREATE INDEX IF NOT EXISTS idx_price_refresh_jobs_started_at
ON public.price_refresh_jobs (started_at DESC);

-- Index for querying by status
CREATE INDEX IF NOT EXISTS idx_price_refresh_jobs_status
ON public.price_refresh_jobs (status);

-- ============================================
-- 2. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.price_refresh_jobs ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (worker uses service role)
CREATE POLICY "Service role manages price_refresh_jobs"
ON public.price_refresh_jobs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Authenticated users can read (for admin dashboards)
CREATE POLICY "Authenticated users can read price_refresh_jobs"
ON public.price_refresh_jobs
FOR SELECT
TO authenticated
USING (true);

-- ============================================
-- 3. HELPER FUNCTIONS
-- ============================================

-- Create a new job and return its ID
CREATE OR REPLACE FUNCTION create_price_refresh_job(p_items_targeted INTEGER DEFAULT 0)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_id UUID;
BEGIN
  INSERT INTO public.price_refresh_jobs (status, items_targeted)
  VALUES ('running', p_items_targeted)
  RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$$;

-- Mark job as succeeded
CREATE OR REPLACE FUNCTION complete_price_refresh_job(
  p_job_id UUID,
  p_items_updated INTEGER,
  p_items_failed INTEGER DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.price_refresh_jobs
  SET
    status = CASE WHEN p_items_failed > 0 THEN 'failed' ELSE 'succeeded' END,
    finished_at = NOW(),
    items_updated = p_items_updated,
    items_failed = p_items_failed
  WHERE id = p_job_id;
END;
$$;

-- Mark job as failed with error
CREATE OR REPLACE FUNCTION fail_price_refresh_job(
  p_job_id UUID,
  p_error TEXT,
  p_is_auth_failure BOOLEAN DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.price_refresh_jobs
  SET
    status = CASE WHEN p_is_auth_failure THEN 'auth_failed' ELSE 'failed' END,
    finished_at = NOW(),
    error = p_error
  WHERE id = p_job_id;
END;
$$;

-- Get the most recent successful job timestamp (for "Updated X ago")
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
  WHERE status = 'succeeded' AND finished_at IS NOT NULL
  ORDER BY finished_at DESC
  LIMIT 1;

  RETURN v_timestamp;
END;
$$;

-- ============================================
-- 4. GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION create_price_refresh_job(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION complete_price_refresh_job(UUID, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION fail_price_refresh_job(UUID, TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION get_last_successful_price_update() TO authenticated;
GRANT EXECUTE ON FUNCTION get_last_successful_price_update() TO service_role;

-- ============================================
-- 5. ENSURE TOKENS TABLE HAS TIMESTAMP COLUMNS
-- ============================================

-- Add last_price_updated_at to tokens if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'tokens'
    AND column_name = 'last_price_updated_at'
  ) THEN
    ALTER TABLE public.tokens ADD COLUMN last_price_updated_at TIMESTAMPTZ;
  END IF;
END $$;

-- Add value_updated_at to tokens if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'tokens'
    AND column_name = 'value_updated_at'
  ) THEN
    ALTER TABLE public.tokens ADD COLUMN value_updated_at TIMESTAMPTZ;
  END IF;
END $$;

-- ============================================
-- 6. DOCUMENTATION
-- ============================================

COMMENT ON TABLE public.price_refresh_jobs IS
  'Tracks each price refresh worker run for observability and "Updated X ago" feature';

COMMENT ON COLUMN public.price_refresh_jobs.status IS
  'running=in progress, succeeded=completed ok, failed=completed with errors, auth_failed=StockX auth issue';
