-- Migration: Add custody_status to assets table
-- Distinguishes between items Bloom has in vault vs items that need to be acquired

-- 1. Add custody_status column
ALTER TABLE public.assets
ADD COLUMN IF NOT EXISTS custody_status TEXT NOT NULL DEFAULT 'available_to_acquire'
CHECK (custody_status IN ('in_vault', 'available_to_acquire'));

-- 2. Add index for filtering by custody status
CREATE INDEX IF NOT EXISTS idx_assets_custody_status ON public.assets(custody_status);

-- 3. Mark the Black Cat J4 as in_vault (this is physically in Bloom's vault)
UPDATE public.assets
SET custody_status = 'in_vault'
WHERE name ILIKE '%Black Cat%' AND name ILIKE '%Jordan 4%';

-- 4. All other assets default to available_to_acquire (already set by DEFAULT)

-- 5. Create RPC to get marketplace assets with custody status
CREATE OR REPLACE FUNCTION get_marketplace_assets(
  p_filter TEXT DEFAULT 'all' -- 'all', 'instant', 'acquire'
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  image_url TEXT,
  price NUMERIC,
  size TEXT,
  category TEXT,
  custody_status TEXT,
  price_change NUMERIC,
  price_change_percent NUMERIC,
  last_price_update TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.name,
    a.image_url,
    a.price,
    a.size,
    a.category,
    a.custody_status,
    a.price_change,
    a.price_change_percent,
    a.last_price_update
  FROM public.assets a
  WHERE
    (a.status = 'listed' OR a.owner_id IS NULL)
    AND (
      p_filter = 'all'
      OR (p_filter = 'instant' AND a.custody_status = 'in_vault')
      OR (p_filter = 'acquire' AND a.custody_status = 'available_to_acquire')
    )
  ORDER BY
    CASE WHEN a.custody_status = 'in_vault' THEN 0 ELSE 1 END, -- Instant items first
    a.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_marketplace_assets(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_marketplace_assets(TEXT) TO anon;

-- 6. Update the existing market assets RPC to include custody_status
-- Must drop first because return type is changing
DROP FUNCTION IF EXISTS get_market_assets_with_changes();

CREATE OR REPLACE FUNCTION get_market_assets_with_changes()
RETURNS TABLE (
  id UUID,
  name TEXT,
  image_url TEXT,
  price NUMERIC,
  size TEXT,
  category TEXT,
  custody_status TEXT,
  price_24h_ago NUMERIC,
  price_change NUMERIC,
  price_change_percent NUMERIC,
  last_price_update TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.name,
    a.image_url,
    a.price,
    a.size,
    a.category,
    a.custody_status,
    a.price_24h_ago,
    a.price_change,
    a.price_change_percent,
    a.last_price_update
  FROM public.assets a
  WHERE a.status = 'listed' OR a.owner_id IS NULL
  ORDER BY
    CASE WHEN a.custody_status = 'in_vault' THEN 0 ELSE 1 END,
    a.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_market_assets_with_changes() TO authenticated;
GRANT EXECUTE ON FUNCTION get_market_assets_with_changes() TO anon;
