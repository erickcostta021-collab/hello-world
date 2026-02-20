-- Drop the existing non-unique index and create a UNIQUE one
DROP INDEX IF EXISTS idx_message_map_ghl_id;
CREATE UNIQUE INDEX idx_message_map_ghl_id ON public.message_map (ghl_message_id);