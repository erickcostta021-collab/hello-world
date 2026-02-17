
-- Remove existing cron jobs to recreate with new schedules
SELECT cron.unschedule('refresh-all-tokens');
SELECT cron.unschedule('enforce-grace-period');
SELECT cron.unschedule('health-check');
SELECT cron.unschedule('cleanup-processed-messages');
SELECT cron.unschedule('cleanup-phone-mappings');
SELECT cron.unschedule('cleanup-webhook-metrics');
SELECT cron.unschedule('cleanup-health-alerts');
SELECT cron.unschedule('cleanup-message-mappings');

-- 1. cleanup_old_processed_messages - A cada hora
SELECT cron.schedule('cleanup-processed-messages', '0 * * * *', 'SELECT public.cleanup_old_processed_messages()');

-- 2. cleanup_old_phone_mappings - Diário às 03:00
SELECT cron.schedule('cleanup-phone-mappings', '0 3 * * *', 'SELECT public.cleanup_old_phone_mappings()');

-- 3. cleanup_old_message_mappings - A cada hora
SELECT cron.schedule('cleanup-message-mappings', '0 * * * *', 'SELECT public.cleanup_old_message_mappings()');

-- 4. enforce-grace-period - A cada hora
SELECT cron.schedule(
  'enforce-grace-period',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url:='https://jtabmlyjgtrgimnhvixb.supabase.co/functions/v1/enforce-grace-period',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0YWJtbHlqZ3RyZ2ltbmh2aXhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMjM0MTYsImV4cCI6MjA4NDY5OTQxNn0.UmypVGfLvhgP_RNIYsIXL4Bd8xo6SXRb0noVVLDPk8E"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);

-- 5. health-check - A cada 3 minutos
SELECT cron.schedule(
  'health-check',
  '*/3 * * * *',
  $$
  SELECT net.http_post(
    url:='https://jtabmlyjgtrgimnhvixb.supabase.co/functions/v1/health-check',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0YWJtbHlqZ3RyZ2ltbmh2aXhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMjM0MTYsImV4cCI6MjA4NDY5OTQxNn0.UmypVGfLvhgP_RNIYsIXL4Bd8xo6SXRb0noVVLDPk8E"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);

-- 6. cleanup_old_webhook_metrics - Diário às 03:00
SELECT cron.schedule('cleanup-webhook-metrics', '0 3 * * *', 'SELECT public.cleanup_old_webhook_metrics()');

-- 7. cleanup_old_health_alerts - Diário às 04:00
SELECT cron.schedule('cleanup-health-alerts', '0 4 * * *', 'SELECT public.cleanup_old_health_alerts()');

-- 8. refresh-all-tokens - A cada 12 horas
SELECT cron.schedule(
  'refresh-all-tokens',
  '0 */12 * * *',
  $$
  SELECT net.http_post(
    url:='https://jtabmlyjgtrgimnhvixb.supabase.co/functions/v1/refresh-all-tokens',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0YWJtbHlqZ3RyZ2ltbmh2aXhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMjM0MTYsImV4cCI6MjA4NDY5OTQxNn0.UmypVGfLvhgP_RNIYsIXL4Bd8xo6SXRb0noVVLDPk8E"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id;
  $$
);
