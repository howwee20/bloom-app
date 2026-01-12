-- Auto-baseline cost basis when first price is fetched
-- This ensures catalog-added items show P/L ticker ($0.00 / 0.0%) immediately after pricing

CREATE OR REPLACE FUNCTION auto_baseline_cost_basis()
RETURNS TRIGGER AS $$
BEGIN
  -- Only set cost basis if:
  -- 1. price is being set to a real value (not NULL, not 0)
  -- 2. purchase_price is currently NULL (user didn't provide one)
  -- 3. This is the first time price is set (OLD.price was NULL or 0)
  IF NEW.price IS NOT NULL
     AND NEW.price > 0
     AND NEW.purchase_price IS NULL
     AND (OLD.price IS NULL OR OLD.price = 0)
  THEN
    NEW.purchase_price := NEW.price;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_baseline_cost_basis ON public.assets;
CREATE TRIGGER trigger_auto_baseline_cost_basis
BEFORE UPDATE ON public.assets
FOR EACH ROW
EXECUTE FUNCTION auto_baseline_cost_basis();
