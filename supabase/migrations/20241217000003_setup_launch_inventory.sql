-- Migration: Setup Launch Inventory
-- Clears all existing items and adds exactly 11 approved items
-- All items are Size 10 with verified all-in pricing from StockX (as of 12/17)

-- First, clear all existing data (order matters due to FK constraints)
DELETE FROM public.orders;
DELETE FROM public.price_history;
DELETE FROM public.assets;

-- Insert the 11 approved launch items
INSERT INTO public.assets (id, name, price, size, category, brand, status, image_url, stockx_sku, created_at)
VALUES
  -- Jordan 4 Retro Black Cat (2025) - All-in: $342.76
  (
    gen_random_uuid(),
    'Jordan 4 Retro Black Cat (2025)',
    342.76,
    '10',
    'Sneakers',
    'Jordan',
    'listed',
    'https://images.stockx.com/images/Air-Jordan-4-Retro-Black-Cat-2020-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
    'CU1110-010',
    NOW()
  ),

  -- Jordan 11 Retro Gamma Blue (2025) - All-in: $378.03
  (
    gen_random_uuid(),
    'Jordan 11 Retro Gamma Blue (2025)',
    378.03,
    '10',
    'Sneakers',
    'Jordan',
    'listed',
    'https://images.stockx.com/images/Air-Jordan-11-Retro-Gamma-Blue-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1606318694',
    '378037-006',
    NOW()
  ),

  -- adidas Yeezy Slide Onyx - All-in: $302.53
  (
    gen_random_uuid(),
    'adidas Yeezy Slide Onyx',
    302.53,
    '10',
    'Slides',
    'adidas',
    'listed',
    'https://images.stockx.com/images/adidas-Yeezy-Slide-Dark-Onyx-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
    'HQ6448',
    NOW()
  ),

  -- Nike Dunk Low Panda - All-in: $84.86
  (
    gen_random_uuid(),
    'Nike Dunk Low Panda',
    84.86,
    '10',
    'Sneakers',
    'Nike',
    'listed',
    'https://images.stockx.com/images/Nike-Dunk-Low-Retro-White-Black-2021-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
    'DD1391-100',
    NOW()
  ),

  -- Jordan 1 Retro High OG Lost and Found - All-in: $325.53
  (
    gen_random_uuid(),
    'Jordan 1 Retro High OG Lost and Found',
    325.53,
    '10',
    'Sneakers',
    'Jordan',
    'listed',
    'https://images.stockx.com/images/Air-Jordan-1-Retro-High-OG-Chicago-Reimagined-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
    'DZ5485-612',
    NOW()
  ),

  -- Nike SB Dunk Low Nardwuar - All-in: $198.92
  (
    gen_random_uuid(),
    'Nike SB Dunk Low Nardwuar',
    198.92,
    '10',
    'Sneakers',
    'Nike',
    'listed',
    'https://images.stockx.com/images/Nike-SB-Dunk-Low-Nardwuar-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
    'II1493-600',
    NOW()
  ),

  -- Jordan 11 Retro Legend Blue (2024) - All-in: $224.97
  (
    gen_random_uuid(),
    'Jordan 11 Retro Legend Blue (2024)',
    224.97,
    '10',
    'Sneakers',
    'Jordan',
    'listed',
    'https://images.stockx.com/images/Air-Jordan-11-Retro-Legend-Blue-2024-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
    'CT8012-104',
    NOW()
  ),

  -- New Balance 9060 Triple Black - All-in: $157.58
  (
    gen_random_uuid(),
    'New Balance 9060 Triple Black',
    157.58,
    '10',
    'Sneakers',
    'New Balance',
    'listed',
    'https://images.stockx.com/images/New-Balance-9060-Black-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1668441687',
    'U9060BK',
    NOW()
  ),

  -- ASICS Gel-1130 Black Pure Silver - All-in: $156.66
  (
    gen_random_uuid(),
    'ASICS Gel-1130 Black Pure Silver',
    156.66,
    '10',
    'Sneakers',
    'ASICS',
    'listed',
    'https://images.stockx.com/images/ASICS-Gel-1130-Black-Pure-Silver-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1696517285',
    '1201A256-003',
    NOW()
  ),

  -- adidas Samba OG Cloud White Core Black - All-in: $85.92
  (
    gen_random_uuid(),
    'adidas Samba OG Cloud White Core Black',
    85.92,
    '10',
    'Sneakers',
    'adidas',
    'listed',
    'https://images.stockx.com/images/adidas-Samba-OG-Cloud-White-Core-Black-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1696517285',
    'B75806',
    NOW()
  ),

  -- adidas Yeezy Slide Flax - All-in: $173.70
  (
    gen_random_uuid(),
    'adidas Yeezy Slide Flax',
    173.70,
    '10',
    'Slides',
    'adidas',
    'listed',
    'https://images.stockx.com/images/adidas-Yeezy-Slide-Flax-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
    'FZ5896',
    NOW()
  );

-- Verify: Should show exactly 11 items
-- SELECT name, price, size FROM public.assets ORDER BY price DESC;
