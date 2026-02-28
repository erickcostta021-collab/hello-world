
-- Add advanced recurring fields to scheduled_group_messages
ALTER TABLE public.scheduled_group_messages
  ADD COLUMN weekdays integer[] DEFAULT NULL,
  ADD COLUMN day_of_month integer DEFAULT NULL,
  ADD COLUMN send_time text DEFAULT NULL,
  ADD COLUMN end_date timestamp with time zone DEFAULT NULL,
  ADD COLUMN max_executions integer DEFAULT NULL,
  ADD COLUMN execution_count integer DEFAULT 0;
