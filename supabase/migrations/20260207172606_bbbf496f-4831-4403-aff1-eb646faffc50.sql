-- Add per-instance base URL column for manual/independent instances
ALTER TABLE public.instances
ADD COLUMN uazapi_base_url text DEFAULT NULL;

-- Add a comment for documentation
COMMENT ON COLUMN public.instances.uazapi_base_url IS 'Optional per-instance UAZAPI base URL. When set, this instance uses its own server instead of the global user_settings.uazapi_base_url.';