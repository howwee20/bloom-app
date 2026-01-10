-- Migration: App Secrets Table
-- Stores rotating API tokens (like StockX OAuth) that need to persist across worker runs
-- Uses singleton pattern like pricing_config table

-- ============================================
-- 1. CREATE APP_SECRETS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.app_secrets (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- Singleton pattern

  -- StockX OAuth tokens
  stockx_access_token TEXT,
  stockx_access_token_expires_at TIMESTAMPTZ,
  stockx_refresh_token TEXT,
  stockx_refresh_token_updated_at TIMESTAMPTZ,

  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert empty singleton row
INSERT INTO public.app_secrets (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 2. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;

-- Only service_role can read secrets (not even authenticated users)
CREATE POLICY "Service role can read app_secrets"
ON public.app_secrets FOR SELECT
TO service_role
USING (true);

-- Only service_role can update secrets
CREATE POLICY "Service role can update app_secrets"
ON public.app_secrets FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================
-- 3. HELPER FUNCTIONS
-- ============================================

-- Get StockX tokens (returns NULL values if not set)
CREATE OR REPLACE FUNCTION get_stockx_tokens()
RETURNS TABLE (
  access_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  refresh_token TEXT,
  refresh_token_updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.stockx_access_token,
    s.stockx_access_token_expires_at,
    s.stockx_refresh_token,
    s.stockx_refresh_token_updated_at
  FROM public.app_secrets s
  WHERE s.id = 1;
END;
$$;

-- Update StockX tokens after refresh
CREATE OR REPLACE FUNCTION update_stockx_tokens(
  p_access_token TEXT,
  p_access_token_expires_at TIMESTAMPTZ,
  p_refresh_token TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.app_secrets
  SET
    stockx_access_token = p_access_token,
    stockx_access_token_expires_at = p_access_token_expires_at,
    stockx_refresh_token = p_refresh_token,
    stockx_refresh_token_updated_at = NOW(),
    updated_at = NOW()
  WHERE id = 1;
END;
$$;

-- ============================================
-- 4. GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION get_stockx_tokens() TO service_role;
GRANT EXECUTE ON FUNCTION update_stockx_tokens(TEXT, TIMESTAMPTZ, TEXT) TO service_role;

-- ============================================
-- 5. DOCUMENTATION
-- ============================================

COMMENT ON TABLE public.app_secrets IS
  'Singleton table for storing rotating API secrets (OAuth tokens) that need to persist across worker runs';

COMMENT ON COLUMN public.app_secrets.stockx_refresh_token IS
  'StockX rotates refresh tokens on each use - this column stores the current valid token';
