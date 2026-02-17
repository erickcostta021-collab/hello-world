
-- Public function: returns admin's client_id and conversation_provider_id for all authenticated users
CREATE OR REPLACE FUNCTION public.get_admin_oauth_public_config()
  RETURNS TABLE(ghl_client_id text, ghl_conversation_provider_id text)
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT us.ghl_client_id, us.ghl_conversation_provider_id
  FROM public.user_settings us
  INNER JOIN public.user_roles ur ON ur.user_id = us.user_id
  WHERE ur.role = 'admin'
    AND us.ghl_client_id IS NOT NULL
  ORDER BY us.created_at ASC
  LIMIT 1;
END;
$$;
