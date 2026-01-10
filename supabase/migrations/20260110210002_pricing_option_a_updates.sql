-- Migration: Pricing Option A updates (raw ask + job status schema + freshness fields)

-- 1) Assets: store raw ask + currency + pricing freshness timestamp
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS raw_stockx_ask NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS raw_stockx_currency TEXT,
  ADD COLUMN IF NOT EXISTS updated_at_pricing TIMESTAMPTZ;

-- 2) Price refresh jobs: add new counters + error summary
ALTER TABLE public.price_refresh_jobs
  ADD COLUMN IF NOT EXISTS updated_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failed_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_summary TEXT;

-- Normalize existing status values
UPDATE public.price_refresh_jobs
SET status = CASE
  WHEN status = 'succeeded' THEN 'success'
  WHEN status = 'failed' THEN 'error'
  ELSE status
END
WHERE status IN ('succeeded', 'failed');

-- Update status constraint to new enum-like set
ALTER TABLE public.price_refresh_jobs
  DROP CONSTRAINT IF EXISTS price_refresh_jobs_status_check;

ALTER TABLE public.price_refresh_jobs
  ADD CONSTRAINT price_refresh_jobs_status_check
  CHECK (status IN ('running', 'success', 'error', 'auth_failed'));

-- 3) Helper functions updated to new status + counters
CREATE OR REPLACE FUNCTION create_price_refresh_job(p_items_targeted INTEGER DEFAULT 0)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_id UUID;
BEGIN
  INSERT INTO public.price_refresh_jobs (status, items_targeted, updated_count, failed_count)
  VALUES ('running', p_items_targeted, 0, 0)
  RETURNING id INTO v_job_id;

  RETURN v_job_id;
END;
$$;

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
    status = CASE WHEN p_items_failed > 0 THEN 'error' ELSE 'success' END,
    finished_at = NOW(),
    items_updated = p_items_updated,
    items_failed = p_items_failed,
    updated_count = p_items_updated,
    failed_count = p_items_failed,
    error_summary = NULL,
    error = NULL
  WHERE id = p_job_id;
END;
$$;

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
    status = CASE WHEN p_is_auth_failure THEN 'auth_failed' ELSE 'error' END,
    finished_at = NOW(),
    error_summary = p_error,
    error = p_error
  WHERE id = p_job_id;
END;
$$;

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
  WHERE status = 'success' AND finished_at IS NOT NULL
  ORDER BY finished_at DESC
  LIMIT 1;

  RETURN v_timestamp;
END;
$$;

GRANT EXECUTE ON FUNCTION create_price_refresh_job(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION complete_price_refresh_job(UUID, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION fail_price_refresh_job(UUID, TEXT, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION get_last_successful_price_update() TO authenticated;
GRANT EXECUTE ON FUNCTION get_last_successful_price_update() TO service_role;

-- 4) RPCs: include updated_at_pricing on assets
DROP FUNCTION IF EXISTS get_portfolio_with_pnl();

CREATE OR REPLACE FUNCTION get_portfolio_with_pnl()
RETURNS TABLE (
  id UUID,
  name TEXT,
  image_url TEXT,
  size TEXT,
  category TEXT,
  stockx_sku TEXT,
  current_price NUMERIC(10, 2),
  entry_price NUMERIC(10, 2),
  pnl_dollars NUMERIC(10, 2),
  pnl_percent NUMERIC(5, 2),
  last_price_update TIMESTAMPTZ,
  last_price_checked_at TIMESTAMPTZ,
  last_price_updated_at TIMESTAMPTZ,
  updated_at_pricing TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.name,
    a.image_url,
    a.size,
    a.category,
    a.stockx_sku,
    a.price AS current_price,
    a.purchase_price AS entry_price,
    CASE
      WHEN a.purchase_price IS NOT NULL AND a.purchase_price > 0
      THEN a.price - a.purchase_price
      ELSE NULL
    END AS pnl_dollars,
    CASE
      WHEN a.purchase_price IS NOT NULL AND a.purchase_price > 0
      THEN ROUND(((a.price - a.purchase_price) / a.purchase_price * 100)::NUMERIC, 2)
      ELSE NULL
    END AS pnl_percent,
    a.last_price_update,
    a.last_price_checked_at,
    a.last_price_updated_at,
    a.updated_at_pricing
  FROM public.assets a
  WHERE a.owner_id = auth.uid()
  ORDER BY a.created_at DESC;
END;
$$;

DROP FUNCTION IF EXISTS get_asset_with_price_change(UUID);

CREATE OR REPLACE FUNCTION get_asset_with_price_change(p_asset_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  image_url TEXT,
  price NUMERIC(10, 2),
  size TEXT,
  category TEXT,
  brand TEXT,
  stockx_sku TEXT,
  last_price_update TIMESTAMPTZ,
  last_price_checked_at TIMESTAMPTZ,
  last_price_updated_at TIMESTAMPTZ,
  updated_at_pricing TIMESTAMPTZ,
  price_24h_ago NUMERIC(10, 2),
  price_change NUMERIC(10, 2),
  price_change_percent NUMERIC(6, 2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_price_24h_ago NUMERIC(10, 2);
BEGIN
  SELECT ph.price INTO v_price_24h_ago
  FROM public.price_history ph
  WHERE ph.asset_id = p_asset_id
    AND ph.created_at <= NOW() - INTERVAL '24 hours'
  ORDER BY ph.created_at DESC
  LIMIT 1;

  RETURN QUERY
  SELECT
    a.id,
    a.name,
    a.image_url,
    a.price,
    a.size,
    a.category,
    a.brand,
    a.stockx_sku,
    a.last_price_update,
    a.last_price_checked_at,
    a.last_price_updated_at,
    a.updated_at_pricing,
    COALESCE(v_price_24h_ago, a.price) AS price_24h_ago,
    CASE
      WHEN v_price_24h_ago IS NOT NULL
      THEN a.price - v_price_24h_ago
      ELSE 0
    END AS price_change,
    CASE
      WHEN v_price_24h_ago IS NOT NULL AND v_price_24h_ago > 0
      THEN ROUND(((a.price - v_price_24h_ago) / v_price_24h_ago * 100)::NUMERIC, 2)
      ELSE 0
    END AS price_change_percent
  FROM public.assets a
  WHERE a.id = p_asset_id;
END;
$$;
