-- Create table for message deduplication
CREATE TABLE IF NOT EXISTS public.ghl_processed_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_ghl_processed_messages_message_id ON public.ghl_processed_messages(message_id);

-- Create index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_ghl_processed_messages_created_at ON public.ghl_processed_messages(created_at);

-- Enable RLS
ALTER TABLE public.ghl_processed_messages ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (edge functions use service role)
CREATE POLICY "Service role can manage processed messages"
ON public.ghl_processed_messages
FOR ALL
USING (true)
WITH CHECK (true);

-- Create function to clean old entries (older than 1 hour)
CREATE OR REPLACE FUNCTION public.cleanup_old_processed_messages()
RETURNS void AS $$
BEGIN
  DELETE FROM public.ghl_processed_messages
  WHERE created_at < now() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;