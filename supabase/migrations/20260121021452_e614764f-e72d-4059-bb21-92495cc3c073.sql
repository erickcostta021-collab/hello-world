-- Add column for Supabase Management API PAT token
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS external_supabase_pat TEXT;