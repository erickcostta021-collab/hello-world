
-- Table to store CDN scripts and their versions
CREATE TABLE public.cdn_scripts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL,
  version text NOT NULL,
  content text NOT NULL,
  content_type text NOT NULL DEFAULT 'application/javascript',
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Unique constraint: only one version per slug
ALTER TABLE public.cdn_scripts ADD CONSTRAINT cdn_scripts_slug_version_key UNIQUE (slug, version);

-- Enable RLS
ALTER TABLE public.cdn_scripts ENABLE ROW LEVEL SECURITY;

-- Anyone can read active scripts (public CDN)
CREATE POLICY "Anyone can read active cdn scripts"
ON public.cdn_scripts FOR SELECT
USING (is_active = true);

-- Only admins can manage scripts
CREATE POLICY "Admins can manage cdn scripts"
ON public.cdn_scripts FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- Trigger for updated_at
CREATE TRIGGER update_cdn_scripts_updated_at
BEFORE UPDATE ON public.cdn_scripts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to ensure only one active version per slug
CREATE OR REPLACE FUNCTION public.ensure_single_active_cdn_script()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_active = true THEN
    UPDATE public.cdn_scripts
    SET is_active = false
    WHERE slug = NEW.slug AND id != NEW.id AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER ensure_single_active_cdn_script
BEFORE INSERT OR UPDATE ON public.cdn_scripts
FOR EACH ROW
EXECUTE FUNCTION public.ensure_single_active_cdn_script();
