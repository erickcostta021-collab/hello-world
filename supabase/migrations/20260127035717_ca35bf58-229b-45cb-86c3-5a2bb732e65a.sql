-- Add column to track which user's data should be mirrored
ALTER TABLE public.user_settings 
ADD COLUMN shared_from_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add index for faster lookups
CREATE INDEX idx_user_settings_shared_from ON public.user_settings(shared_from_user_id);

-- Create function to find the original owner of an agency token
CREATE OR REPLACE FUNCTION public.get_token_owner(p_agency_token TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id 
  FROM user_settings 
  WHERE ghl_agency_token = p_agency_token 
    AND shared_from_user_id IS NULL
  ORDER BY created_at ASC
  LIMIT 1
$$;

-- Create function to get the effective user_id for data access (original or self)
CREATE OR REPLACE FUNCTION public.get_effective_user_id(p_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(shared_from_user_id, p_user_id)
  FROM user_settings
  WHERE user_id = p_user_id
$$;

-- Update RLS policies for ghl_subaccounts to allow viewing shared data
CREATE POLICY "Users can view shared subaccounts"
ON public.ghl_subaccounts
FOR SELECT
USING (
  user_id = public.get_effective_user_id(auth.uid())
);

-- Update RLS policies for instances to allow viewing shared data
CREATE POLICY "Users can view shared instances"
ON public.instances
FOR SELECT
USING (
  user_id = public.get_effective_user_id(auth.uid())
);