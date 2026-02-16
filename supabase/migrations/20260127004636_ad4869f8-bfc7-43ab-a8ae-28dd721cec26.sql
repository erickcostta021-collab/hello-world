-- Create table to store original WhatsApp IDs for group contacts in GHL
-- This allows webhook-outbound to look up the real WhatsApp group JID 
-- when GHL sends a different/converted phone number

CREATE TABLE public.ghl_contact_phone_mapping (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  original_phone TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(contact_id, location_id)
);

-- Enable RLS
ALTER TABLE public.ghl_contact_phone_mapping ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (edge functions use service role)
CREATE POLICY "Service role can manage phone mappings"
  ON public.ghl_contact_phone_mapping
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create index for faster lookups
CREATE INDEX idx_contact_phone_mapping_contact ON public.ghl_contact_phone_mapping(contact_id, location_id);
CREATE INDEX idx_contact_phone_mapping_phone ON public.ghl_contact_phone_mapping(original_phone, location_id);

-- Add trigger for updated_at
CREATE TRIGGER update_ghl_contact_phone_mapping_updated_at
  BEFORE UPDATE ON public.ghl_contact_phone_mapping
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();