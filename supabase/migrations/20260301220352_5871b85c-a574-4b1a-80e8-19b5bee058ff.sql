
-- Add status column to enable queue-based processing
ALTER TABLE public.message_send_order ADD COLUMN status text NOT NULL DEFAULT 'pending';

-- Index for efficient queue polling (find pending messages before mine)
CREATE INDEX idx_message_send_order_queue 
  ON public.message_send_order(conversation_key, status, id);

-- Drop the old RPC since we'll use direct table operations instead
DROP FUNCTION IF EXISTS public.get_send_position(text, bigint);

-- Update cleanup function to be more aggressive with sent messages
CREATE OR REPLACE FUNCTION public.cleanup_old_send_order()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.message_send_order WHERE created_at < now() - INTERVAL '1 minute';
END;
$$;
