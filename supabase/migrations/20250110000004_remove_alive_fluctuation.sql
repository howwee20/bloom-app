-- Migration: Remove deprecated alive_fluctuation setting

ALTER TABLE public.pricing_config
  DROP COLUMN IF EXISTS alive_fluctuation;
