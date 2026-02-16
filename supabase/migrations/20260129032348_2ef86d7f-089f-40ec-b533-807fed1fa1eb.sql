
-- Remove duplicate lead_phone entries keeping only the most recent one
DELETE FROM contact_instance_preferences a
USING contact_instance_preferences b
WHERE a.lead_phone = b.lead_phone 
  AND a.location_id = b.location_id
  AND a.updated_at < b.updated_at;

-- Add unique constraint on lead_phone + location_id
ALTER TABLE contact_instance_preferences 
ADD CONSTRAINT contact_instance_preferences_lead_phone_location_id_key 
UNIQUE (lead_phone, location_id);

-- Create index for faster lookups by lead_phone
CREATE INDEX IF NOT EXISTS idx_contact_instance_preferences_lead_phone_location 
ON contact_instance_preferences(lead_phone, location_id);
