-- Add track_id column to user_settings
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS track_id TEXT UNIQUE;

-- Generate track_id for existing users
UPDATE public.user_settings
SET track_id = gen_random_uuid()::text
WHERE track_id IS NULL;

-- Make track_id NOT NULL with default for new records
ALTER TABLE public.user_settings
ALTER COLUMN track_id SET DEFAULT gen_random_uuid()::text;

-- Update handle_new_user function to include track_id generation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, email) VALUES (NEW.id, NEW.email);
  INSERT INTO public.user_settings (user_id, track_id) VALUES (NEW.id, gen_random_uuid()::text);
  RETURN NEW;
END;
$function$;