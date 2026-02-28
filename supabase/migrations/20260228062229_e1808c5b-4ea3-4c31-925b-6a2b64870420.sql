
-- Add media columns to scheduled_group_messages
ALTER TABLE public.scheduled_group_messages
  ADD COLUMN media_url text,
  ADD COLUMN media_type text; -- 'image', 'video', 'audio', 'document'
