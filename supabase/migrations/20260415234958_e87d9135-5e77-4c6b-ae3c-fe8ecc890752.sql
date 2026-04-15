
CREATE OR REPLACE FUNCTION public.update_instance_for_embed(
  p_instance_id uuid,
  p_embed_token text,
  p_instance_name text DEFAULT NULL::text,
  p_is_official_api boolean DEFAULT NULL::boolean,
  p_ignore_groups boolean DEFAULT NULL::boolean,
  p_ghl_user_id text DEFAULT NULL::text,
  p_embed_visible_options jsonb DEFAULT NULL::jsonb,
  p_instance_status text DEFAULT NULL::text,
  p_phone text DEFAULT NULL::text,
  p_profile_pic_url text DEFAULT NULL::text,
  p_auto_tag text DEFAULT NULL::text
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
    auto_tag = CASE WHEN p_auto_tag IS NOT NULL THEN NULLIF(p_auto_tag, '') ELSE i.auto_tag END,
    updated_at = now()
  WHERE i.id = p_instance_id
    AND EXISTS (
      SELECT 1 FROM public.ghl_subaccounts s
      WHERE s.id = i.subaccount_id AND s.embed_token = p_embed_token
    );
  
  RETURN FOUND;
END;
$function$;
