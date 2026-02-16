-- Add ghl_user_id column to instances table
ALTER TABLE public.instances 
ADD COLUMN IF NOT EXISTS ghl_user_id TEXT;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_instances_ghl_user_id ON public.instances(ghl_user_id);