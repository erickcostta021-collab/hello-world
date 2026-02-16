-- Add lead_phone column to track preferences by the lead's actual phone number
-- This allows preferences to work across different GHL contacts that represent the same lead
ALTER TABLE public.contact_instance_preferences 
ADD COLUMN IF NOT EXISTS lead_phone text;

-- Create index for faster lookups by lead_phone
CREATE INDEX IF NOT EXISTS idx_contact_instance_preferences_lead_phone 
ON public.contact_instance_preferences(lead_phone, location_id);

-- Make lead_phone + location_id the primary way to identify preferences
-- We keep contact_id for backward compatibility but lead_phone takes priority
CREATE UNIQUE INDEX IF NOT EXISTS uq_contact_instance_preferences_lead_phone_location
ON public.contact_instance_preferences(lead_phone, location_id) 
WHERE lead_phone IS NOT NULL;