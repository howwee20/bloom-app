-- Price Worker Infrastructure
-- Adds advisory lock functions and ensures required fields exist

-- ============================================
-- 1. ADVISORY LOCK FUNCTIONS (prevent overlapping runs)
-- ============================================

-- Acquire lock for price updates (lock ID 12345)
CREATE OR REPLACE FUNCTION acquire_price_update_lock()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN pg_try_advisory_lock(12345);
END;
$$;

-- Release lock for price updates
CREATE OR REPLACE FUNCTION release_price_update_lock()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM pg_advisory_unlock(12345);
END;
$$;

-- ============================================
-- 2. ENSURE ASSETS TABLE HAS REQUIRED FIELDS
-- ============================================

-- Add price_error column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assets' AND column_name = 'price_error'
  ) THEN
    ALTER TABLE assets ADD COLUMN price_error TEXT;
  END IF;
END $$;

-- Add price_source column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assets' AND column_name = 'price_source'
  ) THEN
    ALTER TABLE assets ADD COLUMN price_source TEXT DEFAULT 'stockx';
  END IF;
END $$;

-- Add price_updated_at column if not exists (distinct from last_price_checked_at)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assets' AND column_name = 'price_updated_at'
  ) THEN
    ALTER TABLE assets ADD COLUMN price_updated_at TIMESTAMPTZ;
  END IF;
END $$;

-- ============================================
-- 3. DISABLE OLD BROKEN TRIGGERS
-- ============================================

-- Unschedule old pg_cron job if it exists (calls broken edge function)
DO $$
BEGIN
  -- Check if cron extension exists and job exists
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('update-stockx-prices');
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- Job doesn't exist or cron not available, that's fine
    NULL;
END $$;

-- ============================================
-- 4. GRANT PERMISSIONS
-- ============================================

GRANT EXECUTE ON FUNCTION acquire_price_update_lock() TO service_role;
GRANT EXECUTE ON FUNCTION release_price_update_lock() TO service_role;
