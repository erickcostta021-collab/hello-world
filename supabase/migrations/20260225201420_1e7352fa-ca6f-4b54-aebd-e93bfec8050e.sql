CREATE OR REPLACE FUNCTION public.cleanup_old_message_mappings()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() AND current_setting('role', true) != 'service_role' THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  -- Keep mappings for 7 days instead of 24 hours to allow reactions/replies on older messages
  DELETE FROM public.message_map WHERE created_at < now() - INTERVAL '7 days';
END;
$function$;