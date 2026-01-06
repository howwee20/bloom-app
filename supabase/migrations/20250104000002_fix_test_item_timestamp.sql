-- Quick fix: Set last_price_update on test item
UPDATE public.assets
SET last_price_update = NOW()
WHERE name = 'Test Token - $0.50';
