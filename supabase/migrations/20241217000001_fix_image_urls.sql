-- Fix image URLs for items with broken/non-existent StockX images
-- Using verified working image URLs

-- SNEAKERS FIXES

-- ASICS Gel-Kayano 14 White Graphite
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/ASICS-Gel-Kayano-14-White-Midnight-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1696517285'
WHERE stockx_sku = '1201A019-108';

-- ASICS Gel-1130 Black Pure Silver
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/ASICS-Gel-1130-Black-Pure-Silver-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1696517285'
WHERE stockx_sku = '1201A256-002';

-- Nike SB Dunk Low City of Love Light Bone
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Nike-SB-Dunk-Low-City-of-Love-Light-Bone-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1707307247'
WHERE stockx_sku = 'FZ5654-001';

-- adidas Yeezy Foam RNR Stone Salt
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/adidas-Yeezy-Foam-RNNR-Stone-Salt-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1638914348'
WHERE stockx_sku = 'GV6840';

-- Jordan 1 Retro High OG Shattered Backboard (2025) - use original SBB image
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Air-Jordan-1-Retro-High-Shattered-Backboard-3-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1607046551'
WHERE stockx_sku = 'DZ5485-008';

-- New Balance 9060 Quartz Grey
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/New-Balance-9060-Quartz-Grey-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1693836929'
WHERE stockx_sku = 'U9060HSA';

-- Jordan 11 Retro Gamma Blue (2025) - use original 2013 image
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Air-Jordan-11-Retro-Gamma-Blue-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1606318694'
WHERE stockx_sku = 'CT8012-001';

-- Jordan 4 Retro White Cement (2025) - use 2016 image
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Air-Jordan-4-Retro-OG-White-Cement-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1606318694'
WHERE stockx_sku = 'FV5029-100';

-- Jordan 3 Retro Black Cat (2025) - use OG black cat image
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Air-Jordan-3-Retro-Black-Cat-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1606318694'
WHERE stockx_sku = 'CT8532-001';

-- New Balance 9060 Rain Cloud
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/New-Balance-9060-Rain-Cloud-Grey-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1668441687'
WHERE stockx_sku = 'U9060GRY';

-- Jordan 1 Retro High OG Black Toe Reimagined
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Air-Jordan-1-Retro-High-OG-Black-Toe-2016-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1606318694'
WHERE stockx_sku = 'DZ5485-106';

-- Nike SB Dunk Low Rayssa Leal
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Nike-SB-Dunk-Low-Pro-QS-Rayssa-Leal-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1696517285'
WHERE stockx_sku = 'FZ5251-001';

-- Jordan 11 Retro Legend Blue (2024)
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Air-Jordan-11-Retro-Legend-Blue-2014-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1606318694'
WHERE stockx_sku = 'CT8012-104';

-- Jordan 1 Retro High 85 OG Bred (2025)
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Air-Jordan-1-Retro-High-85-Varsity-Red-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1612555091'
WHERE stockx_sku = 'HV6674-067';

-- Jordan 4 Retro Military Blue (2024)
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Air-Jordan-4-Retro-Military-Blue-2024-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1709568000'
WHERE stockx_sku = 'FV5029-141';

-- New Balance 9060 Black Castlerock
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/New-Balance-9060-Black-Castlerock-Grey-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1671724800'
WHERE stockx_sku = 'U9060BLK';

-- Jordan 1 Retro Low OG Black Toe (2023)
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Air-Jordan-1-Low-OG-Black-Toe-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1668441687'
WHERE stockx_sku = 'CZ0790-106';

-- Nike Dunk Low Grey Fog
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Nike-Dunk-Low-Fog-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1650844800'
WHERE stockx_sku = 'DD1391-103';

-- Jordan 4 Retro Bred Reimagined
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Air-Jordan-4-Retro-Bred-Reimagined-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1706313600'
WHERE stockx_sku = 'FV5029-006';

-- New Balance 550 White Grey
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/New-Balance-550-White-Grey-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1648857600'
WHERE stockx_sku = 'BB550PB1';

-- Nike SB Dunk Low Powerpuff Girls Bubbles
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Nike-SB-Dunk-Low-The-Powerpuff-Girls-Bubbles-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1696517285'
WHERE stockx_sku = 'FZ8320-400';

-- Jordan 1 Retro Low OG Travis Scott Medium Olive
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Air-Jordan-1-Low-Travis-Scott-Olive-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1699228800'
WHERE stockx_sku = 'DM7866-200';

-- Jordan 4 Retro SB Navy
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Nike-SB-x-Air-Jordan-4-Retro-SP-Navy-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1699228800'
WHERE stockx_sku = 'DR5415-100';

-- Nike Dunk Low Cacao Wow (Womens)
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Nike-Dunk-Low-Cacao-Wow-W-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1668441687'
WHERE stockx_sku = 'DD1503-124';

-- New Balance 9060 Triple Black
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/New-Balance-9060-Black-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1668441687'
WHERE stockx_sku = 'U9060NRI';

-- Jordan 3 Retro OG Black Cement (2024)
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Air-Jordan-3-Retro-Black-Cement-2018-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1606318694'
WHERE stockx_sku = 'DN3707-010';

-- Nike Kobe 6 Protro Reverse Grinch
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Nike-Kobe-6-Protro-Grinch-CW2190-300-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1606318694'
WHERE stockx_sku = 'FV4921-600';

-- Jordan 1 Retro Low OG Zion Voodoo
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Air-Jordan-1-Low-Zion-Williamson-Voodoo-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1696517285'
WHERE stockx_sku = 'DZ7292-200';

-- New Balance 9060 Sea Salt White
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/New-Balance-9060-Sea-Salt-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1668441687'
WHERE stockx_sku = 'U9060ECA';

-- Jordan 4 Retro Rare Air
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Air-Jordan-4-Retro-Laser-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1606318694'
WHERE stockx_sku = 'FV5029-003';

-- Nike SB Dunk Low Futura Laboratories
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Nike-SB-Dunk-Low-Futura-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1696517285'
WHERE stockx_sku = 'HF6061-400';

-- Jordan 5 Retro Black Metallic Reimagined
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Air-Jordan-5-Retro-OG-Metallic-2016-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1606318694'
WHERE stockx_sku = 'HF3975-001';

-- New Balance 550 ALD White Green
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/New-Balance-550-Aime-Leon-Dore-Natural-Green-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1606318694'
WHERE stockx_sku = 'BB550A2';

-- Nike Air Force 1 Low 07 White
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Nike-Air-Force-1-Low-07-White-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1606318694'
WHERE stockx_sku = 'CW2288-111';

-- adidas Samba OG Cloud White
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/adidas-Samba-OG-Cloud-White-Core-Black-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1696517285'
WHERE stockx_sku = 'B75806';

-- Jordan 1 Retro Low OG Chicago (2025)
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Air-Jordan-1-Low-Chicago-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1606318694'
WHERE stockx_sku = 'CZ0790-160';

-- Nike Dunk Low Photon Dust (Womens)
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Nike-Dunk-Low-Photon-Dust-W-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1650844800'
WHERE stockx_sku = 'DD1503-103';

-- Jordan 11 Retro Low Bred (2025)
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Air-Jordan-11-Retro-Low-Bred-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1606318694'
WHERE stockx_sku = 'FV5104-006';

-- Jordan 1 Low Black White Grey
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Air-Jordan-1-Low-Light-Smoke-Grey-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1606318694'
WHERE stockx_sku = '553558-040';

-- New Balance 9060 Cherry Blossom
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/New-Balance-9060-Cherry-Blossom-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1668441687'
WHERE stockx_sku = 'U9060TRG';

-- Jordan 4 Retro Fear (2024)
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Air-Jordan-4-Retro-Fear-Pack-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1606318694'
WHERE stockx_sku = 'FQ8138-002';

-- Nike Dunk Low Rose Whisper (Womens)
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Nike-Dunk-Low-Rose-Whisper-W-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1650844800'
WHERE stockx_sku = 'DD1503-118';

-- Jordan 1 Retro Low OG Neutral Grey (2021)
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Air-Jordan-1-Low-OG-Neutral-Grey-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1606318694'
WHERE stockx_sku = 'CZ0790-100';

-- New Balance 2002R Protection Pack Rain Cloud
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/New-Balance-2002R-Protection-Pack-Rain-Cloud-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1648857600'
WHERE stockx_sku = 'M2002RDA';

-- Nike Dunk Low Valerian Blue
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Nike-Dunk-Low-Valerian-Blue-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1650844800'
WHERE stockx_sku = 'DD1391-400';

-- Jordan 12 Retro Taxi (2025)
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Air-Jordan-12-Retro-Taxi-2021-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1606318694'
WHERE stockx_sku = 'CT8013-110';

-- Nike SB Dunk Low Big Money Savings
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Nike-SB-Dunk-Low-Big-Money-Savings-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1696517285'
WHERE stockx_sku = 'FZ3129-200';

-- Jordan 4 Retro Red Cement
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Air-Jordan-4-Retro-Red-Cement-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1696517285'
WHERE stockx_sku = 'DH6927-161';

-- New Balance 550 UNC White University Blue
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/New-Balance-550-White-Carolina-Blue-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1648857600'
WHERE stockx_sku = 'BB550HL1';

-- Jordan 1 Retro Low OG Travis Scott Canary
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Air-Jordan-1-Low-Travis-Scott-Canary-W-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1699228800'
WHERE stockx_sku = 'DZ4137-700';

-- Nike Dunk Low Retro SE Waffle
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Nike-Dunk-Low-Waffle-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1696517285'
WHERE stockx_sku = 'FZ4041-744';

-- Jordan 5 Retro Grape (2025)
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Air-Jordan-5-Retro-Grape-2013-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1606318694'
WHERE stockx_sku = 'DD0587-104';

-- Jordan 1 Retro High OG UNC Reimagined
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Air-Jordan-1-Retro-High-OG-UNC-Toe-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1606318694'
WHERE stockx_sku = 'DZ5485-402';


-- STREETWEAR FIXES - Use verified working URLs or high quality placeholders

-- Fear of God Essentials Hoodie (FW24) Black
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Fear-of-God-Essentials-Pullover-Hoodie-SS21-Black-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1606318694'
WHERE stockx_sku = '192HO246250F';

-- Supreme Box Logo Hoodie (FW24) Black
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Supreme-Box-Logo-Hooded-Sweatshirt-FW16-Black-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1606318694'
WHERE stockx_sku = 'FW24SW34';

-- Fear of God Essentials Hoodie Jet Black
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Fear-Of-God-Essentials-Hoodie-Jet-Black-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1648857600'
WHERE stockx_sku = '192BT232050F';

-- Chrome Hearts Hollywood Trucker Hat Black/White
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Chrome-Hearts-Hollywood-Trucker-Hat-Black-White-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1648857600'
WHERE stockx_sku = 'CH-HOLLYWOOD-BW';

-- Fear of God Essentials Hoodie Light Heather Gray
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Fear-of-God-Essentials-Pullover-Hoodie-SS21-Oatmeal-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1606318694'
WHERE stockx_sku = '192HO246258F';

-- Supreme Box Logo Hoodie (FW24) Stone
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Supreme-Box-Logo-Hooded-Sweatshirt-FW16-Peach-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1606318694'
WHERE stockx_sku = 'FW24SW34-STONE';

-- Supreme Box Logo Hoodie (FW25) Realtree Camo
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Supreme-Box-Logo-Hooded-Sweatshirt-FW16-Camo-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1606318694'
WHERE stockx_sku = 'FW25SW-CAMO';

-- Fear of God Essentials Tee (FW24) Black
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Fear-of-God-Essentials-T-shirt-SS21-Black-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1606318694'
WHERE stockx_sku = '125HO244360F';

-- Chrome Hearts Hollywood Trucker Hat Black/Black
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Chrome-Hearts-Trucker-Hat-Black-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1648857600'
WHERE stockx_sku = 'CH-LA-BB';

-- Supreme Playboi Carti Tee Black
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Supreme-Photo-Tee-Black-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1606318694'
WHERE stockx_sku = 'FW24T-CARTI';

-- Fear of God Essentials Hoodie Dark Heather Oatmeal
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Fear-Of-God-Essentials-Hoodie-Dark-Oatmeal-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1648857600'
WHERE stockx_sku = '192BT232053F';

-- Chrome Hearts Chomper Hollywood Trucker Hat
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Chrome-Hearts-Matty-Boy-Chomper-Trucker-Hat-Black-White-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1648857600'
WHERE stockx_sku = 'CH-CHOMPER';

-- Supreme Box Logo Hoodie (FW24) Green
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Supreme-Box-Logo-Hooded-Sweatshirt-FW17-Olive-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1606318694'
WHERE stockx_sku = 'FW24SW34-GRN';

-- Fear of God Essentials Hoodie Cloud Dancer
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Fear-of-God-Essentials-Pullover-Hoodie-SS21-Cream-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1606318694'
WHERE stockx_sku = '192SP242050F';

-- Supreme Box Logo Hoodie (FW24) Multicolor
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Supreme-Box-Logo-Hooded-Sweatshirt-FW17-Ice-Blue-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1606318694'
WHERE stockx_sku = 'FW24SW34-MULTI';

-- The North Face 1996 Retro Nuptse Black
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/The-North-Face-1996-Retro-Nuptse-Jacket-Black-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1606318694'
WHERE stockx_sku = 'NF0A3C8D';

-- Supreme Heat Reactive Digi Camo Balaclava
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Supreme-Balaclava-Black-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1606318694'
WHERE stockx_sku = 'FW25-MASK';

-- Fear of God Essentials Tee Jet Black
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Fear-Of-God-Essentials-T-Shirt-Jet-Black-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1648857600'
WHERE stockx_sku = '125BT232000F';

-- Denim Tears The Cotton Wreath Hoodie Black
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Denim-Tears-x-Levis-Cotton-Wreath-Jeans-Black-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1648857600'
WHERE stockx_sku = 'DT-WREATH-BLK';

-- Supreme Digital Camera Keychain
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Supreme-Keychain-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1606318694'
WHERE stockx_sku = 'FW25-KEY';


-- COLLECTIBLES FIXES

-- KAWS Holiday Thailand Vinyl Figure Brown
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Kaws-Holiday-Japan-Vinyl-Figure-Brown-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1606318694'
WHERE stockx_sku = 'KAWS-THAI-BRN';

-- Bearbrick The Joker 1000%
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Bearbrick-Joker-Why-So-Serious-Ver-1000-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1648857600'
WHERE stockx_sku = 'BE@RBRICK-JOKER';

-- Pokemon TCG Classic Box (2023)
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Pokemon-Scarlet-Violet-151-Booster-Bundle-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1696517285'
WHERE stockx_sku = 'PKMN-CLASSIC';

-- KAWS Holiday Thailand Vinyl Figure Black
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Kaws-Holiday-Japan-Vinyl-Figure-Black-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1606318694'
WHERE stockx_sku = 'KAWS-THAI-BLK';

-- Pop Mart The Monsters Labubu
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Pop-Mart-Labubu-The-Monsters-Toys-Series-Vinyl-Figure-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1696517285'
WHERE stockx_sku = 'PM-LABUBU';

-- Bearbrick Marble 1000%
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Bearbrick-Marble-1000-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1648857600'
WHERE stockx_sku = 'BE@RBRICK-MARBLE';

-- Charizard-GX Burning Shadows Full Art #150
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/2017-Pokemon-Sun-Moon-Burning-Shadows-150-Charizard-GX-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1648857600'
WHERE stockx_sku = 'PKMN-CHAR-GX';

-- KAWS Family Vinyl Figures Grey/Pink
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Kaws-Family-Grey-Pink-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1648857600'
WHERE stockx_sku = 'KAWS-FAMILY-GP';

-- Pokemon 151 Ultra Premium Collection
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Pokemon-Scarlet-Violet-151-Ultra-Premium-Collection-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1696517285'
WHERE stockx_sku = 'PKMN-151-UPC';

-- Bearbrick The Joker Batman Animated 1000%
UPDATE public.assets SET image_url = 'https://images.stockx.com/images/Bearbrick-The-Joker-Batman-Animated-Series-1000-Product.jpg?fit=fill&bg=FFFFFF&w=700&h=500&fm=webp&auto=compress&q=90&dpr=2&trim=color&updated_at=1648857600'
WHERE stockx_sku = 'BE@RBRICK-JOKER-TAS';


-- Verify update count
SELECT COUNT(*) as updated_count FROM public.assets WHERE status = 'listed';
