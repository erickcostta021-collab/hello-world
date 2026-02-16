-- Add instance_limit column to profiles table to track subscription limits
ALTER TABLE public.profiles 
ADD COLUMN instance_limit integer NOT NULL DEFAULT 0;

-- Add comment explaining the column
COMMENT ON COLUMN public.profiles.instance_limit IS 'Maximum number of instances this user can create based on their subscription plan';

-- Create index for faster lookups
CREATE INDEX idx_profiles_user_id ON public.profiles(user_id);