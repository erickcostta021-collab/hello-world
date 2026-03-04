CREATE OR REPLACE FUNCTION public.cleanup_old_processed_messages()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() AND current_setting('role', true) != 'service_role' THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  DELETE FROM public.ghl_processed_messages WHERE created_at < now() - INTERVAL '5 days';
END;
$function$;