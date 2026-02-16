CREATE OR REPLACE FUNCTION public.get_admin_oauth_credentials()
 RETURNS TABLE(ghl_client_id text, ghl_client_secret text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Allow both admin users and service_role calls (from edge functions)
  IF NOT public.is_admin() AND current_setting('role', true) != 'service_role' THEN
    RAISE EXCEPTION 'Access denied: admin or service role required';
  END IF;
  
  RETURN QUERY
  SELECT us.ghl_client_id, us.ghl_client_secret
  FROM public.user_settings us
  INNER JOIN public.user_roles ur ON ur.user_id = us.user_id
  WHERE ur.role = 'admin'
    AND us.ghl_client_id IS NOT NULL AND us.ghl_client_secret IS NOT NULL
  ORDER BY us.created_at ASC LIMIT 1;
END;
$function$;