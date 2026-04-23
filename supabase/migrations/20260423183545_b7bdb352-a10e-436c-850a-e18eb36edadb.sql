-- Drop the two older overloads, keep only the most complete one (with p_auto_tag)
DROP FUNCTION IF EXISTS public.update_instance_for_embed(
  p_instance_id uuid,
  p_embed_token text,
  p_instance_name text,
  p_is_official_api boolean,
  p_ignore_groups boolean,
  p_ghl_user_id text,
  p_embed_visible_options jsonb
);

DROP FUNCTION IF EXISTS public.update_instance_for_embed(
  p_instance_id uuid,
  p_embed_token text,
  p_instance_name text,
  p_is_official_api boolean,
  p_ignore_groups boolean,
  p_ghl_user_id text,
  p_embed_visible_options jsonb,
  p_instance_status text,
  p_phone text,
  p_profile_pic_url text
);