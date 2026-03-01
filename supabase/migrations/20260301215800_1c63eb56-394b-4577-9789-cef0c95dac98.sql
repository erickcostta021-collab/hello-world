
-- Table to atomically assign send order for messages going to GHL
-- Each edge function instance inserts a row and uses the bigserial id to determine its position
CREATE TABLE public.message_send_order (
  id bigserial PRIMARY KEY,
  conversation_key text NOT NULL,
  original_ts bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups by conversation_key within recent window
CREATE INDEX idx_message_send_order_key_created 
  ON public.message_send_order(conversation_key, created_at DESC);

-- Enable RLS (service_role only - used from edge functions)
ALTER TABLE public.message_send_order ENABLE ROW LEVEL SECURITY;

-- Cleanup function to remove old entries (called periodically)
CREATE OR REPLACE FUNCTION public.cleanup_old_send_order()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.message_send_order WHERE created_at < now() - INTERVAL '2 minutes';
END;
$$;

-- RPC to atomically get send position for a conversation
-- Returns the 0-based position among recent messages for the same conversation
CREATE OR REPLACE FUNCTION public.get_send_position(p_conversation_key text, p_original_ts bigint DEFAULT 0)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  my_id bigint;
  pos integer;
BEGIN
  -- Atomically insert and get unique sequential id
  INSERT INTO message_send_order (conversation_key, original_ts)
  VALUES (p_conversation_key, p_original_ts)
  RETURNING id INTO my_id;

  -- Count how many messages for the same conversation have a lower id (= arrived before us)
  -- within a recent time window
  SELECT COUNT(*)::integer INTO pos
  FROM message_send_order
  WHERE conversation_key = p_conversation_key
    AND id < my_id
    AND created_at > now() - INTERVAL '30 seconds';

  -- Opportunistic cleanup of old rows
  DELETE FROM message_send_order WHERE created_at < now() - INTERVAL '2 minutes';

  RETURN pos;
END;
$$;
