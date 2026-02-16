
ALTER TABLE public.cdn_scripts ADD COLUMN subdomain text;

-- Backfill existing scripts based on slug keywords
UPDATE public.cdn_scripts SET subdomain = 
  CASE 
    WHEN lower(slug) LIKE '%toolkit%' THEN 'toolkit.bridgeapi.chat'
    WHEN lower(slug) LIKE '%recorder%' OR lower(slug) LIKE '%ghost%' OR lower(slug) LIKE '%bundle%' THEN 'recorder.bridgeapi.chat'
    ELSE 'switch.bridgeapi.chat'
  END;
