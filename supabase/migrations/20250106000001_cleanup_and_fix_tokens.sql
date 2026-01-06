-- Migration: Clean up test tokens and update Black Cat price
-- Test tokens already deleted by previous run

-- Update Black Cat J4 purchase price to $332.10 (actual user purchase price)
UPDATE public.tokens
SET purchase_price = 332.10
WHERE sku = 'FV5029-006'
   OR sku LIKE 'FV5029%'
   OR product_name ILIKE '%Black Cat%';

-- Also update the current_value to match latest StockX price
-- This will be overwritten by the price worker, but set a reasonable default
UPDATE public.tokens t
SET current_value = (
  SELECT a.price
  FROM public.assets a
  WHERE a.stockx_sku = t.sku
  LIMIT 1
)
WHERE t.sku IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.assets a WHERE a.stockx_sku = t.sku
  );
