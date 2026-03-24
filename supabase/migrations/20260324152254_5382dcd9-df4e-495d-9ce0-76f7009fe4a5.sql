-- Fix: contact_instance_preferences needs public access for embed (unauthenticated)
-- Revert to public but this is acceptable since it only contains contact-instance mappings
DROP POLICY IF EXISTS "Authenticated users can manage contact preferences for embed" ON public.contact_instance_preferences;

CREATE POLICY "Anyone can manage contact preferences for embed"
  ON public.contact_instance_preferences
  FOR ALL
  TO public
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

-- Update the embed instance update RPC to also support status/phone/pic updates
CREATE OR REPLACE FUNCTION public.update_instance_for_embed(
  p_instance_id uuid,
  p_embed_token text,
  p_instance_name text DEFAULT NULL,
  p_is_official_api boolean DEFAULT NULL,
  p_ignore_groups boolean DEFAULT NULL,
  p_ghl_user_id text DEFAULT NULL,
  p_embed_visible_options jsonb DEFAULT NULL,
  p_instance_status text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_profile_pic_url text DEFAULT NULL
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
    instance_status = COALESCE(p_instance_status::instance_status, i.instance_status),
    phone = CASE WHEN p_phone IS NOT NULL THEN NULLIF(p_phone, '') ELSE i.phone END,
    profile_pic_url = CASE WHEN p_profile_pic_url IS NOT NULL THEN NULLIF(p_profile_pic_url, '') ELSE i.profile_pic_url END,
    updated_at = now()
  WHERE i.id = p_instance_id
    AND EXISTS (
      SELECT 1 FROM public.ghl_subaccounts s
      WHERE s.id = i.subaccount_id AND s.embed_token = p_embed_token
    );
  
  RETURN FOUND;
END;
$function$;