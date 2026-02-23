
SELECT cron.schedule(
  'cleanup-command-uploads',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://jtabmlyjgtrgimnhvixb.supabase.co/functions/v1/cleanup-command-uploads',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0YWJtbHlqZ3RyZ2ltbmh2aXhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMjM0MTYsImV4cCI6MjA4NDY5OTQxNn0.UmypVGfLvhgP_RNIYsIXL4Bd8xo6SXRb0noVVLDPk8E"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
