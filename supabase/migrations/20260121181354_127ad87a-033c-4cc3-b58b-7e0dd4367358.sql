-- Add cache columns for phone and profile picture
ALTER TABLE public.instances
ADD COLUMN phone TEXT,
ADD COLUMN profile_pic_url TEXT;