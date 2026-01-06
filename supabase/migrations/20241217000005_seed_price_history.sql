-- Migration: Seed Price History Data
-- Uses SECURITY DEFINER to bypass RLS and populate baseline price history

-- Create a function to seed price history that bypasses RLS
CREATE OR REPLACE FUNCTION seed_price_history_for_asset(
  p_asset_id UUID,
  p_base_price NUMERIC(10, 2)
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days_ago INTEGER;
  v_price NUMERIC(10, 2);
  v_date TIMESTAMPTZ;
BEGIN
  -- Delete any existing history for this asset (clean slate)
  DELETE FROM price_history WHERE asset_id = p_asset_id;

  -- Create 7 days of price history
  FOR v_days_ago IN REVERSE 7..0 LOOP
    v_price := p_base_price;

    -- Set date to noon of each day
    v_date := (NOW() - (v_days_ago || ' days')::INTERVAL)::DATE + INTERVAL '12 hours';

    INSERT INTO price_history (asset_id, price, source, created_at)
    VALUES (
      p_asset_id,
      v_price,
      'baseline',
      v_date
    );
  END LOOP;
END;
$$;

-- Seed price history for all existing assets
DO $$
DECLARE
  asset_record RECORD;
BEGIN
  FOR asset_record IN SELECT id, price FROM assets LOOP
    PERFORM seed_price_history_for_asset(asset_record.id, asset_record.price);
  END LOOP;
END;
$$;

-- Update last_price_update for all assets
UPDATE assets SET last_price_update = NOW();

-- Grant execute permission
GRANT EXECUTE ON FUNCTION seed_price_history_for_asset(UUID, NUMERIC) TO authenticated;
