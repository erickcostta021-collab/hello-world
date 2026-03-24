-- 1. Prevent non-admin users from changing shared_from_user_id (privilege escalation fix)
CREATE OR REPLACE FUNCTION public.prevent_shared_from_user_id_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.shared_from_user_id IS DISTINCT FROM OLD.shared_from_user_id THEN
    IF NOT public.is_admin() AND current_setting('role', true) <> 'service_role' THEN
      RAISE EXCEPTION 'Access denied: shared_from_user_id can only be changed by admin';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER tr_prevent_shared_from_user_id_change
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_shared_from_user_id_change();

-- 2. Remove public read access to registration_requests (exposes emails + codes)
DROP POLICY IF EXISTS "Anyone can read registration requests" ON public.registration_requests;

-- Edge functions use service_role, so they don't need a public policy.
CREATE POLICY "Admins can read registration requests"
  ON public.registration_requests
  FOR SELECT
  TO authenticated
  USING (public.is_admin());