-- Remove default UAZAPI URL for new accounts
ALTER TABLE public.user_settings 
ALTER COLUMN uazapi_base_url SET DEFAULT NULL;