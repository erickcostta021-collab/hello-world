
-- =====================================================
-- FIX 1: Drop USING(true) ALL policies (service_role bypasses RLS anyway)
-- These are RESTRICTIVE policies that the linter flags as overly permissive
-- =====================================================

-- ghl_contact_phone_mapping
DROP POLICY IF EXISTS "Service role can manage phone mappings" ON public.ghl_contact_phone_mapping;

-- ghl_processed_messages
DROP POLICY IF EXISTS "Service role can manage processed messages" ON public.ghl_processed_messages;

-- server_health_alerts (service role policy only, keep user/admin policies)
DROP POLICY IF EXISTS "Service role can manage alerts" ON public.server_health_alerts;

-- webhook_metrics (service role policy only, keep admin SELECT policy)
DROP POLICY IF EXISTS "Service role can insert webhook_metrics" ON public.webhook_metrics;

-- registration_requests: overly permissive UPDATE and INSERT
DROP POLICY IF EXISTS "Anyone can update registration requests" ON public.registration_requests;
DROP POLICY IF EXISTS "Anyone can create registration request" ON public.registration_requests;

-- =====================================================
-- FIX 2: Add admin guard to cleanup SECURITY DEFINER functions
-- Prevents abuse via RPC calls from non-admin users
-- =====================================================

CREATE OR REPLACE FUNCTION public.cleanup_old_processed_messages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() AND current_setting('role', true) != 'service_role' THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  DELETE FROM public.ghl_processed_messages
  WHERE created_at < now() - INTERVAL '1 hour';
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_old_phone_mappings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() AND current_setting('role', true) != 'service_role' THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  DELETE FROM public.ghl_contact_phone_mapping
  WHERE updated_at < now() - INTERVAL '30 days';
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_old_webhook_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() AND current_setting('role', true) != 'service_role' THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  DELETE FROM public.webhook_metrics
  WHERE created_at < now() - INTERVAL '7 days';
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_old_health_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() AND current_setting('role', true) != 'service_role' THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  DELETE FROM public.server_health_alerts
  WHERE status = 'recovered' AND resolved_at < now() - INTERVAL '30 days';
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_old_message_mappings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() AND current_setting('role', true) != 'service_role' THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  DELETE FROM public.message_map
  WHERE created_at < now() - INTERVAL '24 hours';
END;
$$;

-- =====================================================
-- FIX 3: Add admin guard to get_admin_oauth_credentials
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_admin_oauth_credentials()
RETURNS TABLE(ghl_client_id text, ghl_client_secret text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin role required';
  END IF;
  
  RETURN QUERY
  SELECT us.ghl_client_id, us.ghl_client_secret
  FROM public.user_settings us
  INNER JOIN public.user_roles ur ON ur.user_id = us.user_id
  WHERE ur.role = 'admin'
    AND us.ghl_client_id IS NOT NULL AND us.ghl_client_secret IS NOT NULL
  ORDER BY us.created_at ASC LIMIT 1;
END;
$$;

-- =====================================================
-- FIX 4: Move extension from public to extensions schema
-- =====================================================
CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
BEGIN
  -- Move pg_trgm if it exists in public
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm' AND extnamespace = 'public'::regnamespace) THEN
    ALTER EXTENSION pg_trgm SET SCHEMA extensions;
  END IF;
  -- Move uuid-ossp if it exists in public
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp' AND extnamespace = 'public'::regnamespace) THEN
    ALTER EXTENSION "uuid-ossp" SET SCHEMA extensions;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Extension move skipped: %', SQLERRM;
END;
$$;
