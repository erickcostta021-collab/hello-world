-- Add external Supabase integration fields to user_settings
ALTER TABLE public.user_settings
ADD COLUMN external_supabase_url text,
ADD COLUMN external_supabase_key text;