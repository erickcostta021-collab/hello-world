
CREATE OR REPLACE FUNCTION public.cleanup_old_webhook_metrics()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() AND current_setting('role', true) != 'service_role' THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  DELETE FROM public.webhook_metrics
  WHERE created_at < now() - INTERVAL '12 hours'
    AND (error_type IS NULL OR error_type = 'success');
END;
$function$;
