-- Composite index for the process-scheduled-messages cron job query
CREATE INDEX IF NOT EXISTS idx_scheduled_group_messages_status_scheduled
ON public.scheduled_group_messages (status, scheduled_for)
WHERE status = 'pending';