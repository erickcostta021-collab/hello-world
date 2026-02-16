-- Add UNIQUE constraint on ghl_message_id to enable upsert operations
ALTER TABLE public.message_map
ADD CONSTRAINT message_map_ghl_message_id_key UNIQUE (ghl_message_id);