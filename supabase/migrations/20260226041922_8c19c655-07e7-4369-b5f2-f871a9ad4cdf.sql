UPDATE public.cdn_scripts 
SET content = (
  -- Content will be set via the edge function approach instead
  -- For now, just update version
  content
), 
version = 'v1.2.1-beta',
updated_at = now()
WHERE slug = 'bridge-button-beta.js';