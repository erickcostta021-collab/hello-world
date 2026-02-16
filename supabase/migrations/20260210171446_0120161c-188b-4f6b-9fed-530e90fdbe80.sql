
-- Table to store webhook processing metrics (aggregated per minute)
CREATE TABLE public.webhook_metrics (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  function_name text NOT NULL, -- 'webhook-inbound', 'webhook-outbound', 'map-messages'
  status_code integer NOT NULL DEFAULT 200,
  error_type text, -- '429', '5xx', 'network', 'success'
  instance_id uuid REFERENCES public.instances(id) ON DELETE SET NULL,
  location_id text,
  processing_time_ms integer,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Index for time-series queries
CREATE INDEX idx_webhook_metrics_created_at ON public.webhook_metrics (created_at DESC);
CREATE INDEX idx_webhook_metrics_function_error ON public.webhook_metrics (function_name, error_type, created_at DESC);

-- Table for server health alerts
CREATE TABLE public.server_health_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  instance_id uuid REFERENCES public.instances(id) ON DELETE CASCADE,
  instance_name text NOT NULL,
  server_url text NOT NULL,
  status text NOT NULL DEFAULT 'offline', -- 'offline', 'recovered'
  first_detected_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_server_health_alerts_status ON public.server_health_alerts (status, created_at DESC);
CREATE INDEX idx_server_health_alerts_user ON public.server_health_alerts (user_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.webhook_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_health_alerts ENABLE ROW LEVEL SECURITY;

-- webhook_metrics: only admins can view, service role can insert
CREATE POLICY "Admins can view webhook_metrics"
  ON public.webhook_metrics FOR SELECT
  USING (is_admin());

CREATE POLICY "Service role can insert webhook_metrics"
  ON public.webhook_metrics FOR ALL
  USING (true) WITH CHECK (true);

-- server_health_alerts: admins see all, users see own
CREATE POLICY "Admins can view all alerts"
  ON public.server_health_alerts FOR SELECT
  USING (is_admin());

CREATE POLICY "Users can view own alerts"
  ON public.server_health_alerts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage alerts"
  ON public.server_health_alerts FOR ALL
  USING (true) WITH CHECK (true);

-- Cleanup function for old metrics (keep 7 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_webhook_metrics()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.webhook_metrics
  WHERE created_at < now() - INTERVAL '7 days';
END;
$$;

-- Cleanup function for old resolved alerts (keep 30 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_health_alerts()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.server_health_alerts
  WHERE status = 'recovered' AND resolved_at < now() - INTERVAL '30 days';
END;
$$;
