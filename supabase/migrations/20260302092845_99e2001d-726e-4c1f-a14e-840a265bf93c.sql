
-- Add queue control settings for admin
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS queue_enabled boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS queue_batch_ms integer NOT NULL DEFAULT 1000;
