-- Table to store scheduled group messages
CREATE TABLE public.scheduled_group_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  instance_id UUID NOT NULL REFERENCES public.instances(id) ON DELETE CASCADE,
  group_jid TEXT NOT NULL,
  group_name TEXT NOT NULL DEFAULT '',
  message_text TEXT NOT NULL,
  mention_all BOOLEAN NOT NULL DEFAULT false,
  scheduled_for TIMESTAMP WITH TIME ZONE NOT NULL,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  recurring_interval TEXT, -- 'daily', 'weekly', 'monthly'
  status TEXT NOT NULL DEFAULT 'pending', -- pending, sent, failed, cancelled
  last_error TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scheduled_group_messages ENABLE ROW LEVEL SECURITY;

-- Users can manage their own scheduled messages
CREATE POLICY "Users can view own scheduled messages"
  ON public.scheduled_group_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own scheduled messages"
  ON public.scheduled_group_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own scheduled messages"
  ON public.scheduled_group_messages FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own scheduled messages"
  ON public.scheduled_group_messages FOR DELETE
  USING (auth.uid() = user_id);

-- Index for the cron job to find pending messages efficiently
CREATE INDEX idx_scheduled_messages_pending ON public.scheduled_group_messages (scheduled_for)
  WHERE status = 'pending';

-- Trigger for updated_at
CREATE TRIGGER update_scheduled_group_messages_updated_at
  BEFORE UPDATE ON public.scheduled_group_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();