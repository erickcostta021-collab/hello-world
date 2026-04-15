
DROP FUNCTION IF EXISTS public.get_instances_for_embed(uuid, text);

CREATE FUNCTION public.get_instances_for_embed(p_subaccount_id uuid, p_embed_token text)
 RETURNS TABLE(id uuid, instance_name text, instance_status instance_status, phone text, profile_pic_url text, is_official_api boolean, subaccount_id uuid, embed_visible_options jsonb, ignore_groups boolean, ghl_user_id text, auto_tag text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT i.id, i.instance_name, i.instance_status, i.phone, i.profile_pic_url,
         i.is_official_api, i.subaccount_id, i.embed_visible_options, i.ignore_groups, i.ghl_user_id, i.auto_tag
  FROM public.instances i
  INNER JOIN public.ghl_subaccounts s ON s.id = i.subaccount_id
  WHERE i.subaccount_id = p_subaccount_id
    AND s.embed_token = p_embed_token;
$function$;
