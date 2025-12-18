-- StockX Market Intelligence Report: Top 100 Inventory Seed
-- Generated from Q4 2024 - Q1 2025 Strategic Analysis
-- All items are marketplace listings (size = NULL, status = 'listed')

-- First, add 'brand' column if it doesn't exist
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS brand TEXT;

-- ============================================================
-- SNEAKERS (70 Items)
-- ============================================================

-- 1. Jordan 11 Retro Gamma Blue (2025)
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Jordan 11 Retro Gamma Blue (2025)',
  'Jordan',
  'https://images.stockx.com/images/Air-Jordan-11-Retro-Gamma-Blue-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  267.43,
  NULL,
  'listed',
  NULL,
  'CT8012-001',
  'jordan-11-retro-gamma-blue-2025',
  'Sneakers',
  'Top trending holiday release; iconic 2013 retro return.'
);

-- 2. Jordan 4 Retro Black Cat (2025)
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Jordan 4 Retro Black Cat (2025)',
  'Jordan',
  'https://images.stockx.com/images/Air-Jordan-4-Retro-Black-Cat-2020-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  363.87,
  NULL,
  'listed',
  NULL,
  'FV5029-010',
  'air-jordan-4-retro-black-cat-2025',
  'Sneakers',
  'Definitive AJ4 colorway; high utility & durability demand.'
);

-- 3. Jordan 4 Retro White Cement (2025)
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Jordan 4 Retro White Cement (2025)',
  'Jordan',
  'https://images.stockx.com/images/Air-Jordan-4-Retro-White-Cement-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  289.50,
  NULL,
  'listed',
  NULL,
  'FV5029-100',
  'air-jordan-4-retro-white-cement-2025',
  'Sneakers',
  'OG colorway restoration; Reimagined series anchor.'
);

-- 4. adidas Yeezy Slide Onyx
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'adidas Yeezy Slide Onyx',
  'adidas',
  'https://images.stockx.com/images/adidas-Yeezy-Slide-Onyx-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  89.25,
  NULL,
  'listed',
  NULL,
  'HQ6448',
  'adidas-yeezy-slide-black-onyx',
  'Sneakers',
  'Highest liquidity staple; de facto industry standard slide.'
);

-- 5. Nike Dunk Low Retro White Black Panda
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Nike Dunk Low Retro White Black Panda',
  'Nike',
  'https://images.stockx.com/images/Nike-Dunk-Low-Retro-White-Black-2021-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  127.50,
  NULL,
  'listed',
  NULL,
  'DD1391-100',
  'nike-dunk-low-retro-white-black-2021',
  'Sneakers',
  'Perennial bestseller; transcends sneaker culture.'
);

-- 6. adidas Yeezy Foam RNR Onyx
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'adidas Yeezy Foam RNR Onyx',
  'adidas',
  'https://images.stockx.com/images/adidas-Yeezy-Foam-RNNR-Onyx-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  94.80,
  NULL,
  'listed',
  NULL,
  'HP8739',
  'adidas-yeezy-foam-rnnr-onyx',
  'Sneakers',
  'Dominant foam silhouette; essential lifestyle wear.'
);

-- 7. ASICS Gel-1130 Black Pure Silver
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'ASICS Gel-1130 Black Pure Silver',
  'ASICS',
  'https://images.stockx.com/images/ASICS-Gel-1130-Black-Pure-Silver-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  142.35,
  NULL,
  'listed',
  NULL,
  '1201A256-002',
  'asics-gel-1130-black-pure-silver',
  'Sneakers',
  'Leader of the mesh runner aesthetic trend.'
);

-- 8. Jordan 3 Retro Black Cat (2025)
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Jordan 3 Retro Black Cat (2025)',
  'Jordan',
  'https://images.stockx.com/images/Air-Jordan-3-Retro-Black-Cat-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  245.00,
  NULL,
  'listed',
  NULL,
  'CT8532-001',
  'jordan-3-retro-black-cat-2025',
  'Sneakers',
  'High anticipation; completes Black Cat pack narrative.'
);

-- 9. New Balance 9060 Rain Cloud
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'New Balance 9060 Rain Cloud',
  'New Balance',
  'https://images.stockx.com/images/New-Balance-9060-Rain-Cloud-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  168.90,
  NULL,
  'listed',
  NULL,
  'U9060GRY',
  'new-balance-9060-rain-cloud',
  'Sneakers',
  'Top selling NB model; versatile grey scale appeal.'
);

-- 10. adidas Yeezy Slide Bone (2022)
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'adidas Yeezy Slide Bone (2022)',
  'adidas',
  'https://images.stockx.com/images/adidas-Yeezy-Slide-Bone-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  92.15,
  NULL,
  'listed',
  NULL,
  'FZ5897',
  'adidas-yeezy-slide-bone-2022-restock-pair',
  'Sneakers',
  'Essential neutral colorway; consistent restock demand.'
);

-- 11. Jordan 1 Retro High OG Black Toe Reimagined
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Jordan 1 Retro High OG Black Toe Reimagined',
  'Jordan',
  'https://images.stockx.com/images/Air-Jordan-1-Retro-High-OG-Black-Toe-Reimagined-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  215.40,
  NULL,
  'listed',
  NULL,
  'DZ5485-106',
  'air-jordan-1-retro-high-og-black-toe-reimagined',
  'Sneakers',
  'Major 2025 heritage release; vintage aesthetic focus.'
);

-- 12. Nike SB Dunk Low Rayssa Leal
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Nike SB Dunk Low Rayssa Leal',
  'Nike',
  'https://images.stockx.com/images/Nike-SB-Dunk-Low-Rayssa-Leal-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  187.65,
  NULL,
  'listed',
  NULL,
  'FZ5251-001',
  'nike-sb-dunk-low-rayssa-leal',
  'Sneakers',
  'High-value collaboration; skate culture crossover.'
);

-- 13. Jordan 11 Retro Legend Blue (2024)
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Jordan 11 Retro Legend Blue (2024)',
  'Jordan',
  'https://images.stockx.com/images/Air-Jordan-11-Retro-Legend-Blue-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  248.75,
  NULL,
  'listed',
  NULL,
  'CT8012-104',
  'jordan-11-retro-legend-blue-2024',
  'Sneakers',
  'Key holiday 2024 volume driver; Columbia legacy.'
);

-- 14. adidas Yeezy Slide Pure (Restock)
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'adidas Yeezy Slide Pure',
  'adidas',
  'https://images.stockx.com/images/adidas-Yeezy-Slide-Pure-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  88.90,
  NULL,
  'listed',
  NULL,
  'GZ5554',
  'adidas-yeezy-slide-pure',
  'Sneakers',
  'Consistent high volume; alternative to Bone.'
);

-- 15. New Balance 550 White Green
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'New Balance 550 White Green',
  'New Balance',
  'https://images.stockx.com/images/New-Balance-550-White-Green-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  135.00,
  NULL,
  'listed',
  NULL,
  'BB550WT1',
  'new-balance-550-white-green',
  'Sneakers',
  'Standard lifestyle staple; ALD-adjacent aesthetic.'
);

-- 16. Jordan 1 Retro High 85 OG Bred (2025)
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Jordan 1 Retro High 85 OG Bred (2025)',
  'Jordan',
  'https://images.stockx.com/images/Air-Jordan-1-Retro-High-85-OG-Bred-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  312.50,
  NULL,
  'listed',
  NULL,
  'HV6674-067',
  'air-jordan-1-retro-high-85-bred-2025',
  'Sneakers',
  'Premium collector focus; accurate 1985 shape.'
);

-- 17. adidas Yeezy Slide Glow Green (2022)
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'adidas Yeezy Slide Glow Green (2022)',
  'adidas',
  'https://images.stockx.com/images/adidas-Yeezy-Slide-Glow-Green-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  95.40,
  NULL,
  'listed',
  NULL,
  'HQ6447',
  'adidas-yeezy-slide-glow-green-2022-restock',
  'Sneakers',
  'High visibility colorway; summer seasonal peak.'
);

-- 18. Jordan 4 Retro Military Blue (2024)
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Jordan 4 Retro Military Blue (2024)',
  'Jordan',
  'https://images.stockx.com/images/Air-Jordan-4-Retro-Military-Blue-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  225.80,
  NULL,
  'listed',
  NULL,
  'FV5029-141',
  'air-jordan-4-retro-military-blue-2024',
  'Sneakers',
  'Massive 2024 general release; OG colorway.'
);

-- 19. New Balance 9060 Black Castlerock
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'New Balance 9060 Black Castlerock',
  'New Balance',
  'https://images.stockx.com/images/New-Balance-9060-Black-Castlerock-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  165.25,
  NULL,
  'listed',
  NULL,
  'U9060BLK',
  'new-balance-9060-black-castlerock',
  'Sneakers',
  'Versatile daily driver; high attach rate.'
);

-- 20. Jordan 1 Retro Low OG Black Toe (2023)
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Jordan 1 Retro Low OG Black Toe (2023)',
  'Jordan',
  'https://images.stockx.com/images/Air-Jordan-1-Retro-Low-OG-Black-Toe-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  148.90,
  NULL,
  'listed',
  NULL,
  'CZ0790-106',
  'air-jordan-1-retro-low-og-black-toe',
  'Sneakers',
  'Popular low-top variant of classic colorway.'
);

-- 21. adidas Yeezy Slide Resin (2022)
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'adidas Yeezy Slide Resin (2022)',
  'adidas',
  'https://images.stockx.com/images/adidas-Yeezy-Slide-Resin-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  91.75,
  NULL,
  'listed',
  NULL,
  'FZ5904',
  'adidas-yeezy-slide-resin-2022',
  'Sneakers',
  'Earth tone staple; distinct green hue popularity.'
);

-- 22. Nike Dunk Low Grey Fog
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Nike Dunk Low Grey Fog',
  'Nike',
  'https://images.stockx.com/images/Nike-Dunk-Low-Grey-Fog-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  124.50,
  NULL,
  'listed',
  NULL,
  'DD1391-103',
  'nike-dunk-low-grey-fog',
  'Sneakers',
  'Top alternative to Panda dunk; neutral palette.'
);

-- 23. Jordan 4 Retro Bred Reimagined
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Jordan 4 Retro Bred Reimagined',
  'Jordan',
  'https://images.stockx.com/images/Air-Jordan-4-Retro-Bred-Reimagined-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  285.00,
  NULL,
  'listed',
  NULL,
  'FV5029-006',
  'air-jordan-4-retro-bred-reimagined',
  'Sneakers',
  'Leather update to nubuck classic; durability selling point.'
);

-- 24. adidas Yeezy Foam RNR MX Granite
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'adidas Yeezy Foam RNR MX Granite',
  'adidas',
  'https://images.stockx.com/images/adidas-Yeezy-Foam-RNNR-MX-Granite-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  102.40,
  NULL,
  'listed',
  NULL,
  'IE4931',
  'adidas-yeezy-foam-rnnr-mx-granite',
  'Sneakers',
  'Recent foam colorway; marbled aesthetic appeal.'
);

-- 25. New Balance 550 White Grey
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'New Balance 550 White Grey',
  'New Balance',
  'https://images.stockx.com/images/New-Balance-550-White-Grey-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  128.75,
  NULL,
  'listed',
  NULL,
  'BB550PB1',
  'new-balance-550-white-grey',
  'Sneakers',
  'Clean minimalist option; high volume daily wear.'
);

-- 26. Nike SB Dunk Low Powerpuff Girls Bubbles
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Nike SB Dunk Low Powerpuff Girls Bubbles',
  'Nike',
  'https://images.stockx.com/images/Nike-SB-Dunk-Low-Powerpuff-Girls-Bubbles-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  198.50,
  NULL,
  'listed',
  NULL,
  'FZ8320-400',
  'nike-sb-dunk-low-the-powerpuff-girls-bubbles',
  'Sneakers',
  'Cultural collab hype; pop culture collectibility.'
);

-- 27. Jordan 1 Retro Low OG Travis Scott Medium Olive
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Jordan 1 Retro Low OG Travis Scott Medium Olive',
  'Jordan',
  'https://images.stockx.com/images/Air-Jordan-1-Retro-Low-OG-SP-Travis-Scott-Medium-Olive-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  485.00,
  NULL,
  'listed',
  NULL,
  'DM7866-200',
  'air-jordan-1-retro-low-og-sp-travis-scott-medium-olive',
  'Sneakers',
  'High resale premium; Travis Scott brand power.'
);

-- 28. adidas Yeezy Slide Slate Marine
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'adidas Yeezy Slide Slate Marine',
  'adidas',
  'https://images.stockx.com/images/adidas-Yeezy-Slide-Slate-Marine-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  94.20,
  NULL,
  'listed',
  NULL,
  'ID2349',
  'adidas-yeezy-slide-slate-marine',
  'Sneakers',
  'Blue-grey tone popularity; distinct from Onyx.'
);

-- 29. Jordan 4 Retro SB Navy
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Jordan 4 Retro SB Navy',
  'Jordan',
  'https://images.stockx.com/images/Nike-SB-Air-Jordan-4-Retro-Navy-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  342.80,
  NULL,
  'listed',
  NULL,
  'DR5415-100',
  'nike-sb-air-jordan-4-retro-sp-summit-white-navy',
  'Sneakers',
  'SB x Jordan crossover; skate functionality.'
);

-- 30. Nike Dunk Low Cacao Wow (Womens)
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Nike Dunk Low Cacao Wow (Womens)',
  'Nike',
  'https://images.stockx.com/images/Nike-Dunk-Low-Cacao-Wow-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  118.90,
  NULL,
  'listed',
  NULL,
  'DD1503-124',
  'nike-dunk-low-cacao-wow-womens',
  'Sneakers',
  'Top womens exclusive; brown tone trend.'
);

-- 31. New Balance 9060 Triple Black
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'New Balance 9060 Triple Black',
  'New Balance',
  'https://images.stockx.com/images/New-Balance-9060-Triple-Black-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  172.50,
  NULL,
  'listed',
  NULL,
  'U9060NRI',
  'new-balance-9060-triple-black-leather',
  'Sneakers',
  'All-black utility demand; service industry crossover.'
);

-- 32. Jordan 3 Retro OG Black Cement (2024)
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Jordan 3 Retro OG Black Cement (2024)',
  'Jordan',
  'https://images.stockx.com/images/Air-Jordan-3-Retro-OG-Black-Cement-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  268.40,
  NULL,
  'listed',
  NULL,
  'DN3707-010',
  'air-jordan-3-retro-og-black-cement-2024',
  'Sneakers',
  'Reimagined series continuation; aged aesthetic.'
);

-- 33. adidas Yeezy Slide Flax
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'adidas Yeezy Slide Flax',
  'adidas',
  'https://images.stockx.com/images/adidas-Yeezy-Slide-Flax-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  93.60,
  NULL,
  'listed',
  NULL,
  'FZ5896',
  'adidas-yeezy-slide-flax',
  'Sneakers',
  'Fall tone favorite; monochromatic appeal.'
);

-- 34. Nike Kobe 6 Protro Reverse Grinch
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Nike Kobe 6 Protro Reverse Grinch',
  'Nike',
  'https://images.stockx.com/images/Nike-Kobe-6-Protro-Reverse-Grinch-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  385.00,
  NULL,
  'listed',
  NULL,
  'FV4921-600',
  'nike-kobe-6-protro-reverse-grinch',
  'Sneakers',
  'Performance basketball leader; hoop culture icon.'
);

-- 35. Jordan 1 Retro Low OG Zion Voodoo
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Jordan 1 Retro Low OG Zion Voodoo',
  'Jordan',
  'https://images.stockx.com/images/Air-Jordan-1-Retro-Low-OG-Zion-Voodoo-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  156.25,
  NULL,
  'listed',
  NULL,
  'DZ7292-200',
  'air-jordan-1-retro-low-og-zion-williamson-voodoo',
  'Sneakers',
  'Unique material execution; detail-oriented design.'
);

-- 36. New Balance 9060 Sea Salt White
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'New Balance 9060 Sea Salt White',
  'New Balance',
  'https://images.stockx.com/images/New-Balance-9060-Sea-Salt-White-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  178.90,
  NULL,
  'listed',
  NULL,
  'U9060ECA',
  'new-balance-9060-sea-salt-white',
  'Sneakers',
  'Premium Suede Pack; lifestyle luxury focus.'
);

-- 37. adidas Yeezy Foam RNR Carbon
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'adidas Yeezy Foam RNR Carbon',
  'adidas',
  'https://images.stockx.com/images/adidas-Yeezy-Foam-RNNR-Carbon-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  98.50,
  NULL,
  'listed',
  NULL,
  'IG5349',
  'adidas-yeezy-foam-rnnr-carbon',
  'Sneakers',
  'Dark colorway preference; high wearability.'
);

-- 38. Jordan 4 Retro Rare Air
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Jordan 4 Retro Rare Air',
  'Jordan',
  'https://images.stockx.com/images/Air-Jordan-4-Retro-Rare-Air-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  235.75,
  NULL,
  'listed',
  NULL,
  'FV5029-003',
  'air-jordan-4-retro-rare-air-white-lettering',
  'Sneakers',
  '2025 Special Edition; laser aesthetic return.'
);

-- 39. Nike SB Dunk Low Futura Laboratories
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Nike SB Dunk Low Futura Laboratories',
  'Nike',
  'https://images.stockx.com/images/Nike-SB-Dunk-Low-Futura-Laboratories-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  275.00,
  NULL,
  'listed',
  NULL,
  'HF6061-400',
  'nike-sb-dunk-low-futura-laboratories-bleached-aqua',
  'Sneakers',
  'Artistic collaboration; graffiti heritage.'
);

-- 40. Jordan 5 Retro Black Metallic Reimagined
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Jordan 5 Retro Black Metallic Reimagined',
  'Jordan',
  'https://images.stockx.com/images/Air-Jordan-5-Retro-Black-Metallic-Reimagined-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  218.60,
  NULL,
  'listed',
  NULL,
  'HF3975-001',
  'air-jordan-5-retro-black-metallic-reimagined',
  'Sneakers',
  '2025 Heritage release; reflective tongue focus.'
);

-- 41. New Balance 550 ALD White Green
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'New Balance 550 ALD White Green',
  'New Balance',
  'https://images.stockx.com/images/New-Balance-550-Aime-Leon-Dore-White-Green-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  265.40,
  NULL,
  'listed',
  NULL,
  'BB550A2',
  'new-balance-550-aime-leon-dore-natural-green',
  'Sneakers',
  'ALD hype factor; vintage basketball aesthetic.'
);

-- 42. Nike Air Force 1 Low 07 White
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Nike Air Force 1 Low 07 White',
  'Nike',
  'https://images.stockx.com/images/Nike-Air-Force-1-Low-White-07-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  112.50,
  NULL,
  'listed',
  NULL,
  'CW2288-111',
  'nike-air-force-1-low-white-07',
  'Sneakers',
  'The eternal classic; highest volume staple.'
);

-- 43. adidas Samba OG Cloud White
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'adidas Samba OG Cloud White',
  'adidas',
  'https://images.stockx.com/images/adidas-Samba-OG-Cloud-White-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  118.90,
  NULL,
  'listed',
  NULL,
  'B75806',
  'adidas-samba-og-cloud-white-core-black',
  'Sneakers',
  'Terrace culture trend; high fashion adjacency.'
);

-- 44. Jordan 1 Retro Low OG Chicago (2025)
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Jordan 1 Retro Low OG Chicago (2025)',
  'Jordan',
  'https://images.stockx.com/images/Air-Jordan-1-Retro-Low-OG-Chicago-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  168.75,
  NULL,
  'listed',
  NULL,
  'CZ0790-160',
  'air-jordan-1-retro-low-og-chicago-2025',
  'Sneakers',
  'Iconic colorway on low silhouette; massive demand.'
);

-- 45. adidas Yeezy Slide Azure
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'adidas Yeezy Slide Azure',
  'adidas',
  'https://images.stockx.com/images/adidas-Yeezy-Slide-Azure-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  97.25,
  NULL,
  'listed',
  NULL,
  'ID4133',
  'adidas-yeezy-slide-azure',
  'Sneakers',
  'Bright color pop; summer essentials.'
);

-- 46. Nike Dunk Low Photon Dust (Womens)
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Nike Dunk Low Photon Dust (Womens)',
  'Nike',
  'https://images.stockx.com/images/Nike-Dunk-Low-Photon-Dust-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  115.80,
  NULL,
  'listed',
  NULL,
  'DD1503-103',
  'nike-dunk-low-photon-dust-w',
  'Sneakers',
  'Neutral womens staple; clean aesthetic.'
);

-- 47. Jordan 1 Retro High OG Shattered Backboard (2025)
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Jordan 1 Retro High OG Shattered Backboard (2025)',
  'Jordan',
  'https://images.stockx.com/images/Air-Jordan-1-Retro-High-OG-Shattered-Backboard-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  298.50,
  NULL,
  'listed',
  NULL,
  'DZ5485-008',
  'air-jordan-1-retro-high-og-shattered-backboard-2025',
  'Sneakers',
  'Legendary colorway return; orange/black demand.'
);

-- 48. New Balance 9060 Quartz Grey
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'New Balance 9060 Quartz Grey',
  'New Balance',
  'https://images.stockx.com/images/New-Balance-9060-Quartz-Grey-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  164.90,
  NULL,
  'listed',
  NULL,
  'U9060HSA',
  'new-balance-9060-quartz-grey',
  'Sneakers',
  'Neutral daily wear; premium suede mix.'
);

-- 49. ASICS Gel-Kayano 14 White Graphite
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'ASICS Gel-Kayano 14 White Graphite',
  'ASICS',
  'https://images.stockx.com/images/ASICS-Gel-Kayano-14-White-Graphite-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  148.25,
  NULL,
  'listed',
  NULL,
  '1201A019-108',
  'asics-gel-kayano-14-white-graphite-grey',
  'Sneakers',
  'Y2K aesthetic driver; metallic overlay trend.'
);

-- 50. Jordan 11 Retro Low Bred (2025)
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Jordan 11 Retro Low Bred (2025)',
  'Jordan',
  'https://images.stockx.com/images/Air-Jordan-11-Retro-Low-Bred-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  195.40,
  NULL,
  'listed',
  NULL,
  'FV5104-006',
  'jordan-11-retro-low-bred-2025',
  'Sneakers',
  'Low top summer option; classic bulls colors.'
);

-- 51. Nike SB Dunk Low City of Love Light Bone
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Nike SB Dunk Low City of Love Light Bone',
  'Nike',
  'https://images.stockx.com/images/Nike-SB-Dunk-Low-City-of-Love-Light-Bone-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  185.60,
  NULL,
  'listed',
  NULL,
  'FZ5654-001',
  'nike-sb-dunk-low-city-of-love-light-bone',
  'Sneakers',
  'Thematic Valentines release; suede textures.'
);

-- 52. adidas Yeezy Foam RNR Stone Salt
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'adidas Yeezy Foam RNR Stone Salt',
  'adidas',
  'https://images.stockx.com/images/adidas-Yeezy-Foam-RNNR-Stone-Salt-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  96.80,
  NULL,
  'listed',
  NULL,
  'GV6840',
  'adidas-yeezy-foam-rnnr-stone-salt',
  'Sneakers',
  'Earth tone foam; versatile styling.'
);

-- 53. Jordan 1 Low Black White Grey
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Jordan 1 Low Black White Grey',
  'Jordan',
  'https://images.stockx.com/images/Air-Jordan-1-Low-Black-White-Grey-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  108.90,
  NULL,
  'listed',
  NULL,
  '553558-040',
  'air-jordan-1-low-black-white-grey',
  'Sneakers',
  'General release volume; accessible price point.'
);

-- 54. New Balance 9060 Cherry Blossom
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'New Balance 9060 Cherry Blossom',
  'New Balance',
  'https://images.stockx.com/images/New-Balance-9060-Cherry-Blossom-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  182.40,
  NULL,
  'listed',
  NULL,
  'U9060TRG',
  'new-balance-9060-cherry-blossom-mineral-red',
  'Sneakers',
  'Seasonal colorway; pink hue popularity.'
);

-- 55. Jordan 4 Retro Fear (2024)
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Jordan 4 Retro Fear (2024)',
  'Jordan',
  'https://images.stockx.com/images/Air-Jordan-4-Retro-Fear-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  248.90,
  NULL,
  'listed',
  NULL,
  'FQ8138-002',
  'air-jordan-4-retro-fear-2024',
  'Sneakers',
  'Nostalgic pack return; cool grey palette.'
);

-- 56. Nike Dunk Low Rose Whisper (Womens)
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Nike Dunk Low Rose Whisper (Womens)',
  'Nike',
  'https://images.stockx.com/images/Nike-Dunk-Low-Rose-Whisper-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  112.75,
  NULL,
  'listed',
  NULL,
  'DD1503-118',
  'nike-dunk-low-rose-whisper-w',
  'Sneakers',
  'Pastel trend; spring seasonal favorite.'
);

-- 57. adidas Yeezy Slide Slate Grey
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'adidas Yeezy Slide Slate Grey',
  'adidas',
  'https://images.stockx.com/images/adidas-Yeezy-Slide-Slate-Grey-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  91.40,
  NULL,
  'listed',
  NULL,
  'ID2350',
  'adidas-yeezy-slide-slate-grey',
  'Sneakers',
  'Dark grey alternative to Onyx; volume seller.'
);

-- 58. Jordan 1 Retro Low OG Neutral Grey (2021)
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Jordan 1 Retro Low OG Neutral Grey (2021)',
  'Jordan',
  'https://images.stockx.com/images/Air-Jordan-1-Retro-Low-OG-Neutral-Grey-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  142.60,
  NULL,
  'listed',
  NULL,
  'CZ0790-100',
  'air-jordan-1-retro-low-og-neutral-grey-2021',
  'Sneakers',
  'Clean vintage look; 85 cut appreciation.'
);

-- 59. New Balance 2002R Protection Pack Rain Cloud
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'New Balance 2002R Protection Pack Rain Cloud',
  'New Balance',
  'https://images.stockx.com/images/New-Balance-2002R-Protection-Pack-Rain-Cloud-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  198.50,
  NULL,
  'listed',
  NULL,
  'M2002RDA',
  'new-balance-2002r-protection-pack-rain-cloud',
  'Sneakers',
  'Deconstructed aesthetic; viral design success.'
);

-- 60. Nike Dunk Low Valerian Blue
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Nike Dunk Low Valerian Blue',
  'Nike',
  'https://images.stockx.com/images/Nike-Dunk-Low-Valerian-Blue-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  128.90,
  NULL,
  'listed',
  NULL,
  'DD1391-400',
  'nike-dunk-low-valerian-blue',
  'Sneakers',
  'Dark blue staple; collegiate vibe.'
);

-- 61. Jordan 12 Retro Taxi (2025)
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Jordan 12 Retro Taxi (2025)',
  'Jordan',
  'https://images.stockx.com/images/Air-Jordan-12-Retro-Taxi-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  225.60,
  NULL,
  'listed',
  NULL,
  'CT8013-110',
  'air-jordan-12-retro-taxi-2025',
  'Sneakers',
  'OG colorway return; carbon fiber plate detail.'
);

-- 62. Nike SB Dunk Low Big Money Savings
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Nike SB Dunk Low Big Money Savings',
  'Nike',
  'https://images.stockx.com/images/Nike-SB-Dunk-Low-Big-Money-Savings-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  168.75,
  NULL,
  'listed',
  NULL,
  'FZ3129-200',
  'nike-sb-dunk-low-big-money-savings',
  'Sneakers',
  'Unique material story; premium details.'
);

-- 63. adidas Yeezy Foam RNR Clay Taupe
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'adidas Yeezy Foam RNR Clay Taupe',
  'adidas',
  'https://images.stockx.com/images/adidas-Yeezy-Foam-RNNR-Clay-Taupe-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  94.20,
  NULL,
  'listed',
  NULL,
  'GV6842',
  'adidas-yeezy-foam-rnnr-clay-taupe',
  'Sneakers',
  'Neutral foam option; organic color palette.'
);

-- 64. Jordan 4 Retro Red Cement
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Jordan 4 Retro Red Cement',
  'Jordan',
  'https://images.stockx.com/images/Air-Jordan-4-Retro-Red-Cement-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  262.80,
  NULL,
  'listed',
  NULL,
  'DH6927-161',
  'air-jordan-4-retro-red-cement',
  'Sneakers',
  'Twist on OG cement; bold red accents.'
);

-- 65. New Balance 550 UNC White University Blue
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'New Balance 550 UNC White University Blue',
  'New Balance',
  'https://images.stockx.com/images/New-Balance-550-UNC-White-University-Blue-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  138.50,
  NULL,
  'listed',
  NULL,
  'BB550HL1',
  'new-balance-550-unc-white-university-blue',
  'Sneakers',
  'Collegiate colorway; Jordan 1 UNC alternative.'
);

-- 66. Jordan 1 Retro Low OG Travis Scott Canary
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Jordan 1 Retro Low OG Travis Scott Canary',
  'Jordan',
  'https://images.stockx.com/images/Air-Jordan-1-Retro-Low-OG-SP-Travis-Scott-Canary-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  425.00,
  NULL,
  'listed',
  NULL,
  'DZ4137-700',
  'air-jordan-1-retro-low-og-sp-travis-scott-canary',
  'Sneakers',
  'Womens exclusive hype; bold yellow colorway.'
);

-- 67. Nike Dunk Low Retro SE Waffle
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Nike Dunk Low Retro SE Waffle',
  'Nike',
  'https://images.stockx.com/images/Nike-Dunk-Low-Waffle-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  135.40,
  NULL,
  'listed',
  NULL,
  'FZ4041-744',
  'nike-dunk-low-waffle',
  'Sneakers',
  'Textured material play; waffle iron graphic.'
);

-- 68. Jordan 5 Retro Grape (2025)
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Jordan 5 Retro Grape (2025)',
  'Jordan',
  'https://images.stockx.com/images/Air-Jordan-5-Retro-Grape-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  212.75,
  NULL,
  'listed',
  NULL,
  'DD0587-104',
  'air-jordan-5-retro-grape-2025',
  'Sneakers',
  'Fresh Prince nostalgia; 90s icon return.'
);

-- 69. adidas Yeezy Slide Dark Onyx
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'adidas Yeezy Slide Dark Onyx',
  'adidas',
  'https://images.stockx.com/images/adidas-Yeezy-Slide-Dark-Onyx-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  92.80,
  NULL,
  'listed',
  NULL,
  'ID5103',
  'adidas-yeezy-slide-dark-onyx',
  'Sneakers',
  'Darker variation of Onyx; newest black option.'
);

-- 70. Jordan 1 Retro High OG UNC Reimagined
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Jordan 1 Retro High OG UNC Reimagined',
  'Jordan',
  'https://images.stockx.com/images/Air-Jordan-1-Retro-High-OG-UNC-Reimagined-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  205.90,
  NULL,
  'listed',
  NULL,
  'DZ5485-402',
  'air-jordan-1-retro-high-og-unc-reimagined',
  'Sneakers',
  '2025 College Blue release; aged midsole trend.'
);


-- ============================================================
-- STREETWEAR (20 Items)
-- ============================================================

-- 71. Fear of God Essentials Hoodie (FW24) Black
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Fear of God Essentials Hoodie (FW24) Black',
  'Fear of God',
  'https://images.stockx.com/images/Fear-of-God-Essentials-Hoodie-FW24-Black-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  142.50,
  NULL,
  'listed',
  NULL,
  '192HO246250F',
  'fear-of-god-essentials-fleece-hoodie-fw24-black',
  'Streetwear',
  'The #1 volume apparel item; the new standard black hoodie.'
);

-- 72. Supreme Box Logo Hoodie (FW24) Black
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Supreme Box Logo Hoodie (FW24) Black',
  'Supreme',
  'https://images.stockx.com/images/Supreme-Box-Logo-Hoodie-FW24-Black-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  385.00,
  NULL,
  'listed',
  NULL,
  'FW24SW34',
  'supreme-box-logo-hooded-sweatshirt-fw24-black',
  'Streetwear',
  'The classic Bogo returns; extremely high liquidity asset.'
);

-- 73. Fear of God Essentials Hoodie Jet Black
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Fear of God Essentials Hoodie Jet Black',
  'Fear of God',
  'https://images.stockx.com/images/Fear-of-God-Essentials-Hoodie-Jet-Black-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  138.90,
  NULL,
  'listed',
  NULL,
  '192BT232050F',
  'fear-of-god-essentials-hoodie-jet-black',
  'Streetwear',
  'FW23 carryover; remains a top seller for true black.'
);

-- 74. Chrome Hearts Hollywood Trucker Hat Black/White
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Chrome Hearts Hollywood Trucker Hat Black/White',
  'Chrome Hearts',
  'https://images.stockx.com/images/Chrome-Hearts-Hollywood-Trucker-Hat-Black-White-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  485.00,
  NULL,
  'listed',
  NULL,
  'CH-HOLLYWOOD-BW',
  'chrome-hearts-ch-hollywood-trucker-hat-black-white',
  'Streetwear',
  'The entry-level luxury status symbol; high visibility item.'
);

-- 75. Fear of God Essentials Hoodie Light Heather Gray
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Fear of God Essentials Hoodie Light Heather Gray',
  'Fear of God',
  'https://images.stockx.com/images/Fear-of-God-Essentials-Hoodie-Light-Heather-Gray-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  145.75,
  NULL,
  'listed',
  NULL,
  '192HO246258F',
  'fear-of-god-essentials-fleece-hoodie-light-heather-gray',
  'Streetwear',
  'Core colorway for FW24 collection.'
);

-- 76. Supreme Box Logo Hoodie (FW24) Stone
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Supreme Box Logo Hoodie (FW24) Stone',
  'Supreme',
  'https://images.stockx.com/images/Supreme-Box-Logo-Hoodie-FW24-Stone-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  365.00,
  NULL,
  'listed',
  NULL,
  'FW24SW34-STONE',
  'supreme-box-logo-hooded-sweatshirt-fw24-light-brown',
  'Streetwear',
  'Unique seasonal colorway driving high trades; earth tone trend.'
);

-- 77. Supreme Box Logo Hoodie (FW25) Realtree Camo
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Supreme Box Logo Hoodie (FW25) Realtree Camo',
  'Supreme',
  'https://images.stockx.com/images/Supreme-Box-Logo-Hoodie-FW25-Realtree-Camo-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  425.00,
  NULL,
  'listed',
  NULL,
  'FW25SW-CAMO',
  'supreme-box-logo-hooded-sweatshirt-fw25-realtree-ap-camo',
  'Streetwear',
  'High-demand pattern; taps into gorpcore/outdoor trends.'
);

-- 78. Fear of God Essentials Tee (FW24) Black
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Fear of God Essentials Tee (FW24) Black',
  'Fear of God',
  'https://images.stockx.com/images/Fear-of-God-Essentials-Tee-FW24-Black-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  58.90,
  NULL,
  'listed',
  NULL,
  '125HO244360F',
  'fear-of-god-essentials-jersey-crewneck-t-shirt-black',
  'Streetwear',
  'Staple tee; high volume attach rate with hoodies.'
);

-- 79. Chrome Hearts Hollywood Trucker Hat Black/Black
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Chrome Hearts Hollywood Trucker Hat Black/Black',
  'Chrome Hearts',
  'https://images.stockx.com/images/Chrome-Hearts-Hollywood-Trucker-Hat-Black-Black-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  525.00,
  NULL,
  'listed',
  NULL,
  'CH-LA-BB',
  'chrome-hearts-ch-los-angeles-trucker-hat-black-black',
  'Streetwear',
  'Stealth luxury option; consistently high premium over retail.'
);

-- 80. Supreme Playboi Carti Tee Black
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Supreme Playboi Carti Tee Black',
  'Supreme',
  'https://images.stockx.com/images/Supreme-Playboi-Carti-Tee-Black-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  165.00,
  NULL,
  'listed',
  NULL,
  'FW24T-CARTI',
  'supreme-playboi-carti-tee-black',
  'Streetwear',
  'Artist collab driving immense youth interest; viral music marketing.'
);

-- 81. Fear of God Essentials Hoodie Dark Heather Oatmeal
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Fear of God Essentials Hoodie Dark Heather Oatmeal',
  'Fear of God',
  'https://images.stockx.com/images/Fear-of-God-Essentials-Hoodie-Dark-Heather-Oatmeal-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  148.25,
  NULL,
  'listed',
  NULL,
  '192BT232053F',
  'fear-of-god-essentials-pullover-hoodie-fw23-dark-heather-oatmeal',
  'Streetwear',
  'Popular earth tone variant; aligns with Yeezy aesthetic.'
);

-- 82. Chrome Hearts Chomper Hollywood Trucker Hat
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Chrome Hearts Chomper Hollywood Trucker Hat',
  'Chrome Hearts',
  'https://images.stockx.com/images/Chrome-Hearts-Chomper-Hollywood-Trucker-Hat-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  625.00,
  NULL,
  'listed',
  NULL,
  'CH-CHOMPER',
  'chrome-hearts-chomper-hollywood-trucker-hat-black-white',
  'Streetwear',
  'Matty Boy collaboration; high collector value and rarity.'
);

-- 83. Supreme Box Logo Hoodie (FW24) Green
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Supreme Box Logo Hoodie (FW24) Green',
  'Supreme',
  'https://images.stockx.com/images/Supreme-Box-Logo-Hoodie-FW24-Green-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  355.00,
  NULL,
  'listed',
  NULL,
  'FW24SW34-GRN',
  'supreme-box-logo-hooded-sweatshirt-fw24-green',
  'Streetwear',
  'Bright seasonal option; appeals to collectors completing sets.'
);

-- 84. Fear of God Essentials Hoodie Cloud Dancer
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Fear of God Essentials Hoodie Cloud Dancer',
  'Fear of God',
  'https://images.stockx.com/images/Fear-of-God-Essentials-Hoodie-Cloud-Dancer-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  152.40,
  NULL,
  'listed',
  NULL,
  '192SP242050F',
  'fear-of-god-essentials-hoodie-cloud-dancer',
  'Streetwear',
  'Off-white/cream variant popularity; clean minimal look.'
);

-- 85. Supreme Box Logo Hoodie (FW24) Multicolor
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Supreme Box Logo Hoodie (FW24) Multicolor',
  'Supreme',
  'https://images.stockx.com/images/Supreme-Box-Logo-Hoodie-FW24-Multicolor-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  395.00,
  NULL,
  'listed',
  NULL,
  'FW24SW34-MULTI',
  'supreme-box-logo-hooded-sweatshirt-fw24-multicolor',
  'Streetwear',
  'Experimental design for collectors; polarizing but high volume.'
);

-- 86. The North Face 1996 Retro Nuptse Black
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'The North Face 1996 Retro Nuptse Black',
  'The North Face',
  'https://images.stockx.com/images/The-North-Face-1996-Retro-Nuptse-Black-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  285.00,
  NULL,
  'listed',
  NULL,
  'NF0A3C8D',
  'the-north-face-1996-retro-nuptse-700-fill-packable-jacket-recycled-tnf-black',
  'Streetwear',
  'Seasonal winter staple; consistent yearly seller regardless of trends.'
);

-- 87. Supreme Heat Reactive Digi Camo Balaclava
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Supreme Heat Reactive Digi Camo Balaclava',
  'Supreme',
  'https://images.stockx.com/images/Supreme-Balaclava-Digi-Camo-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  95.00,
  NULL,
  'listed',
  NULL,
  'FW25-MASK',
  'supreme-heat-reactive-digi-camo-balaclava-black',
  'Streetwear',
  'Viral accessory trend; low price point volume driver.'
);

-- 88. Fear of God Essentials Tee Jet Black
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Fear of God Essentials Tee Jet Black',
  'Fear of God',
  'https://images.stockx.com/images/Fear-of-God-Essentials-Tee-Jet-Black-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  55.40,
  NULL,
  'listed',
  NULL,
  '125BT232000F',
  'fear-of-god-essentials-classic-short-sleeve-tee-jet-black',
  'Streetwear',
  'FW23 Tee; budget entry to FOG ecosystem.'
);

-- 89. Denim Tears The Cotton Wreath Hoodie Black
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Denim Tears The Cotton Wreath Hoodie Black',
  'Denim Tears',
  'https://images.stockx.com/images/Denim-Tears-The-Cotton-Wreath-Hoodie-Black-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  345.00,
  NULL,
  'listed',
  NULL,
  'DT-WREATH-BLK',
  'denim-tears-the-cotton-wreath-sweatshirt-black',
  'Streetwear',
  'Top trending emerging streetwear brand; visually distinct logo.'
);

-- 90. Supreme Digital Camera Keychain
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Supreme Digital Camera Keychain',
  'Supreme',
  'https://images.stockx.com/images/Supreme-Digital-Camera-Keychain-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  78.50,
  NULL,
  'listed',
  NULL,
  'FW25-KEY',
  'supreme-digital-camera-keychain-white',
  'Streetwear',
  'Functional accessory driving impulse buys; tech-nostalgia.'
);


-- ============================================================
-- COLLECTIBLES (10 Items)
-- ============================================================

-- 91. KAWS Holiday Thailand Vinyl Figure Brown
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'KAWS Holiday Thailand Vinyl Figure Brown',
  'KAWS',
  'https://images.stockx.com/images/KAWS-Holiday-Thailand-Vinyl-Figure-Brown-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  485.00,
  NULL,
  'listed',
  NULL,
  'KAWS-THAI-BRN',
  'kaws-holiday-thailand-vinyl-figure-brown',
  'Collectibles',
  'Commemorates major installation; global appeal due to relaxed pose.'
);

-- 92. Bearbrick The Joker 1000%
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Bearbrick The Joker 1000%',
  'Bearbrick',
  'https://images.stockx.com/images/Bearbrick-The-Joker-1000-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  1250.00,
  NULL,
  'listed',
  NULL,
  'BE@RBRICK-JOKER',
  'bearbrick-the-joker-1000',
  'Collectibles',
  'High-value pop culture crossover; centerpiece for collectors.'
);

-- 93. Pokemon TCG Classic Box (2023)
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Pokemon TCG Classic Box (2023)',
  'Pokemon',
  'https://images.stockx.com/images/Pokemon-TCG-Classic-Box-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  425.00,
  NULL,
  'listed',
  NULL,
  'PKMN-CLASSIC',
  'pokemon-tcg-classic-box',
  'Collectibles',
  'Premium collectors item driving volume; functional nostalgia.'
);

-- 94. KAWS Holiday Thailand Vinyl Figure Black
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'KAWS Holiday Thailand Vinyl Figure Black',
  'KAWS',
  'https://images.stockx.com/images/KAWS-Holiday-Thailand-Vinyl-Figure-Black-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  465.00,
  NULL,
  'listed',
  NULL,
  'KAWS-THAI-BLK',
  'kaws-holiday-thailand-vinyl-figure-black',
  'Collectibles',
  'Alternative colorway to the Brown figure; often bought as a set.'
);

-- 95. Pop Mart The Monsters Labubu
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Pop Mart The Monsters Labubu',
  'Pop Mart',
  'https://images.stockx.com/images/Pop-Mart-Labubu-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  125.00,
  NULL,
  'listed',
  NULL,
  'PM-LABUBU',
  'pop-mart-the-monsters-labubu-fall-in-wild-vinyl-plush-doll',
  'Collectibles',
  'Massive growth trend; ugly-cute aesthetic leader; viral hit.'
);

-- 96. Bearbrick Marble 1000%
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Bearbrick Marble 1000%',
  'Bearbrick',
  'https://images.stockx.com/images/Bearbrick-Marble-1000-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  1450.00,
  NULL,
  'listed',
  NULL,
  'BE@RBRICK-MARBLE',
  'bearbrick-marble-1000',
  'Collectibles',
  'Interior design focused art toy; unique patterning per unit.'
);

-- 97. Charizard-GX Burning Shadows Full Art #150
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Charizard-GX Burning Shadows Full Art #150',
  'Pokemon',
  'https://images.stockx.com/images/Charizard-GX-Burning-Shadows-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  385.00,
  NULL,
  'listed',
  NULL,
  'PKMN-CHAR-GX',
  'pokemon-sun-moon-burning-shadows-charizard-gx-full-art-150',
  'Collectibles',
  'Investment grade card; historically high value and difficulty to grade.'
);

-- 98. KAWS Family Vinyl Figures Grey/Pink
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'KAWS Family Vinyl Figures Grey/Pink',
  'KAWS',
  'https://images.stockx.com/images/KAWS-Family-Vinyl-Figures-Grey-Pink-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  625.00,
  NULL,
  'listed',
  NULL,
  'KAWS-FAMILY-GP',
  'kaws-family-vinyl-figures-grey-pink',
  'Collectibles',
  'Family set appeals to high-end collectors; domestic display appeal.'
);

-- 99. Pokemon 151 Ultra Premium Collection
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Pokemon 151 Ultra Premium Collection',
  'Pokemon',
  'https://images.stockx.com/images/Pokemon-151-Ultra-Premium-Collection-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  185.00,
  NULL,
  'listed',
  NULL,
  'PKMN-151-UPC',
  'pokemon-trading-card-game-scarlet-violet-151-ultra-premium-collection',
  'Collectibles',
  'High volume sealed product; nostalgia driven 151 set success.'
);

-- 100. Bearbrick The Joker Batman Animated 1000%
INSERT INTO public.assets (name, brand, image_url, price, owner_id, status, size, stockx_sku, stockx_slug, category, description)
VALUES (
  'Bearbrick The Joker Batman Animated 1000%',
  'Bearbrick',
  'https://images.stockx.com/images/Bearbrick-Joker-Batman-Animated-1000-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=0',
  1150.00,
  NULL,
  'listed',
  NULL,
  'BE@RBRICK-JOKER-TAS',
  'bearbrick-joker-batman-the-animated-series-version-1000',
  'Collectibles',
  'Nostalgic animated series tie-in; distinct from movie version.'
);


-- ============================================================
-- SUMMARY
-- ============================================================
-- Total items seeded: 100
-- Sneakers: 70
-- Streetwear: 20
-- Collectibles: 10

-- Verify the seed
SELECT category, COUNT(*) as count, AVG(price) as avg_price
FROM public.assets
WHERE status = 'listed' AND owner_id IS NULL
GROUP BY category
ORDER BY count DESC;
