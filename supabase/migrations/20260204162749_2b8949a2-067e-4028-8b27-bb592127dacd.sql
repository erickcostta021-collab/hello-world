-- Create message_map table for GHL <-> UAZAPI message ID mapping
CREATE TABLE public.message_map (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ghl_message_id TEXT NOT NULL,
  uazapi_message_id TEXT,
  location_id TEXT NOT NULL,
  contact_id TEXT,
  message_text TEXT,
  message_type TEXT DEFAULT 'text',
  from_me BOOLEAN DEFAULT false,
  reactions JSONB DEFAULT '[]'::jsonb,
  is_deleted BOOLEAN DEFAULT false,
  is_edited BOOLEAN DEFAULT false,
  original_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create indexes for fast lookups
CREATE INDEX idx_message_map_ghl_id ON public.message_map(ghl_message_id);
CREATE INDEX idx_message_map_uazapi_id ON public.message_map(uazapi_message_id);
CREATE INDEX idx_message_map_location ON public.message_map(location_id);
CREATE INDEX idx_message_map_contact ON public.message_map(contact_id);
CREATE INDEX idx_message_map_timestamp ON public.message_map(original_timestamp);

-- Enable RLS
ALTER TABLE public.message_map ENABLE ROW LEVEL SECURITY;

-- Policy for service role access (edge functions)
CREATE POLICY "Service role can manage message_map"
  ON public.message_map
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add trigger for updated_at
CREATE TRIGGER update_message_map_updated_at
  BEFORE UPDATE ON public.message_map
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for broadcasting updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_map;