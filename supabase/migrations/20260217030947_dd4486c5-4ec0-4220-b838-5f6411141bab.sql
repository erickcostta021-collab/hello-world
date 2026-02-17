
-- Schedule: refresh-all-tokens every 4 hours
SELECT cron.schedule(
  'refresh-all-tokens',
  '0 */4 * * *',
  $$
  SELECT net.http_post(
    url:='https://jtabmlyjgtrgimnhvixb.supabase.co/functions/v1/refresh-all-tokens',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0YWJtbHlqZ3RyZ2ltbmh2aXhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMjM0MTYsImV4cCI6MjA4NDY5OTQxNn0.UmypVGfLvhgP_RNIYsIXL4Bd8xo6SXRb0noVVLDPk8E"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);

-- Schedule: enforce-grace-period every 12 hours
SELECT cron.schedule(
  'enforce-grace-period',
  '0 */12 * * *',
  $$
  SELECT net.http_post(
    url:='https://jtabmlyjgtrgimnhvixb.supabase.co/functions/v1/enforce-grace-period',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0YWJtbHlqZ3RyZ2ltbmh2aXhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMjM0MTYsImV4cCI6MjA4NDY5OTQxNn0.UmypVGfLvhgP_RNIYsIXL4Bd8xo6SXRb0noVVLDPk8E"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);

-- Schedule: health-check every 5 minutes
SELECT cron.schedule(
  'health-check',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url:='https://jtabmlyjgtrgimnhvixb.supabase.co/functions/v1/health-check',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0YWJtbHlqZ3RyZ2ltbmh2aXhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMjM0MTYsImV4cCI6MjA4NDY5OTQxNn0.UmypVGfLvhgP_RNIYsIXL4Bd8xo6SXRb0noVVLDPk8E"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);

-- Cleanup jobs
SELECT cron.schedule('cleanup-processed-messages', '*/30 * * * *', 'SELECT public.cleanup_old_processed_messages()');
SELECT cron.schedule('cleanup-phone-mappings', '0 3 * * *', 'SELECT public.cleanup_old_phone_mappings()');
SELECT cron.schedule('cleanup-webhook-metrics', '0 4 * * *', 'SELECT public.cleanup_old_webhook_metrics()');
SELECT cron.schedule('cleanup-health-alerts', '0 5 * * *', 'SELECT public.cleanup_old_health_alerts()');
SELECT cron.schedule('cleanup-message-mappings', '*/30 * * * *', 'SELECT public.cleanup_old_message_mappings()');
