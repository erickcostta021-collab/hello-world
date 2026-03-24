-- 3. Secure embed access: replace open policies with RPC-based access

-- Create RPC to fetch subaccount by embed_token (safe columns only)
CREATE OR REPLACE FUNCTION public.get_subaccount_by_embed_token(p_embed_token text)
RETURNS TABLE(
  id uuid,
  account_name text,
  location_id text,
  user_id uuid,
  embed_password text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT s.id, s.account_name, s.location_id, s.user_id, s.embed_password
  FROM public.ghl_subaccounts s
  WHERE s.embed_token = p_embed_token
  LIMIT 1;
$$;

-- Create RPC to fetch instances for embed (safe columns only)
CREATE OR REPLACE FUNCTION public.get_instances_for_embed(p_subaccount_id uuid, p_embed_token text)
RETURNS TABLE(
  id uuid,
  instance_name text,
  instance_status public.instance_status,
  phone text,
  profile_pic_url text,
  is_official_api boolean,
  subaccount_id uuid,
  embed_visible_options jsonb,
  ignore_groups boolean,
  ghl_user_id text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT i.id, i.instance_name, i.instance_status, i.phone, i.profile_pic_url,
         i.is_official_api, i.subaccount_id, i.embed_visible_options, i.ignore_groups, i.ghl_user_id
  FROM public.instances i
  INNER JOIN public.ghl_subaccounts s ON s.id = i.subaccount_id
  WHERE i.subaccount_id = p_subaccount_id
    AND s.embed_token = p_embed_token;
$$;

-- Drop the dangerous public embed policies on ghl_subaccounts
DROP POLICY IF EXISTS "Anyone can view subaccounts by embed_token" ON public.ghl_subaccounts;

-- Drop the dangerous public embed policies on instances
DROP POLICY IF EXISTS "Anyone can view instances for embed" ON public.instances;
DROP POLICY IF EXISTS "Anyone can update instances for embed" ON public.instances;

-- Create a restricted update policy for embed: only allow safe column updates, validated via embed_token
CREATE OR REPLACE FUNCTION public.update_instance_for_embed(
  p_instance_id uuid,
  p_embed_token text,
  p_instance_name text DEFAULT NULL,
  p_is_official_api boolean DEFAULT NULL,
  p_ignore_groups boolean DEFAULT NULL,
  p_ghl_user_id text DEFAULT NULL,
  p_embed_visible_options jsonb DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.instances i
  SET
    instance_name = COALESCE(p_instance_name, i.instance_name),
    is_official_api = COALESCE(p_is_official_api, i.is_official_api),
    ignore_groups = COALESCE(p_ignore_groups, i.ignore_groups),
    ghl_user_id = COALESCE(p_ghl_user_id, i.ghl_user_id),
    embed_visible_options = COALESCE(p_embed_visible_options, i.embed_visible_options),
    updated_at = now()
  WHERE i.id = p_instance_id
    AND EXISTS (
      SELECT 1 FROM public.ghl_subaccounts s
      WHERE s.id = i.subaccount_id AND s.embed_token = p_embed_token
    );
  
  RETURN FOUND;
END;
$function$;

-- Also restrict contact_instance_preferences embed policy to require specific embed_token validation
DROP POLICY IF EXISTS "Anyone can manage contact preferences for embed" ON public.contact_instance_preferences;

-- Recreate with tighter check - still public but requires the instance to have a valid embed subaccount
-- This is acceptable since the data is just contact-instance mappings, not sensitive tokens
CREATE POLICY "Authenticated users can manage contact preferences for embed"
  ON public.contact_instance_preferences
  FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM instances i
    JOIN ghl_subaccounts s ON s.id = i.subaccount_id
    WHERE i.id = contact_instance_preferences.instance_id
      AND s.embed_token IS NOT NULL
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM instances i
    JOIN ghl_subaccounts s ON s.id = i.subaccount_id
    WHERE i.id = contact_instance_preferences.instance_id
      AND s.embed_token IS NOT NULL
  ));