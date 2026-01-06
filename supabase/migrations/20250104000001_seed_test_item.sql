-- Migration: Create test item for payment testing
-- This is a $0.50 instant item for end-to-end checkout testing

-- First update if exists (to set last_price_update)
UPDATE public.assets
SET last_price_update = NOW()
WHERE name = 'Test Token - $0.50';

-- Insert test item (only if it doesn't already exist)
INSERT INTO public.assets (
  name,
  image_url,
  price,
  status,
  size,
  category,
  custody_status,
  last_price_update
)
SELECT
  'Test Token - $0.50',
  'https://images.stockx.com/360/Air-Jordan-4-Retro-Black-Cat-2020/Images/Air-Jordan-4-Retro-Black-Cat-2020/Lv2/img01.jpg',
  0.50,
  'listed',
  'N/A',
  'Test',
  'in_vault',
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM public.assets WHERE name = 'Test Token - $0.50'
);

-- Verify the item was created
DO $$
DECLARE
  v_test_id UUID;
BEGIN
  SELECT id INTO v_test_id
  FROM public.assets
  WHERE name = 'Test Token - $0.50'
  LIMIT 1;

  IF v_test_id IS NOT NULL THEN
    RAISE NOTICE 'Test item created with ID: %', v_test_id;
  ELSE
    RAISE NOTICE 'Test item already exists or creation failed';
  END IF;
END $$;
