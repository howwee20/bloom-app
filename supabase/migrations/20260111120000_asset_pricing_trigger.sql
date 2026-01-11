-- Trigger to ensure new assets get enqueued for pricing
-- New assets with a stockx_sku should have last_price_checked_at = NULL
-- which puts them first in the worker's queue (NULLS FIRST ordering)

CREATE OR REPLACE FUNCTION enqueue_asset_for_pricing()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure new assets with SKUs get prioritized for pricing
  -- The NULL last_price_checked_at already puts them first in queue
  -- This trigger can optionally notify the worker for immediate pickup
  IF NEW.stockx_sku IS NOT NULL AND NEW.last_price_checked_at IS NULL THEN
    -- Notify worker that a new asset needs pricing (optional optimization)
    PERFORM pg_notify('new_asset_needs_price', NEW.id::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on assets table
DROP TRIGGER IF EXISTS trigger_enqueue_asset_for_pricing ON public.assets;
CREATE TRIGGER trigger_enqueue_asset_for_pricing
AFTER INSERT ON public.assets
FOR EACH ROW
EXECUTE FUNCTION enqueue_asset_for_pricing();

-- Backfill: Re-queue any existing assets that have NULL or zero prices
-- This ensures they get picked up by the next worker run
UPDATE public.assets
SET last_price_checked_at = NULL
WHERE (price IS NULL OR price = 0)
  AND stockx_sku IS NOT NULL
  AND last_price_checked_at IS NOT NULL;
