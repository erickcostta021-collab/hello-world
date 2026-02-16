-- Add embed_token column for white-label iframe links
ALTER TABLE public.ghl_subaccounts 
ADD COLUMN embed_token TEXT UNIQUE;

-- Create index for faster lookups
CREATE INDEX idx_ghl_subaccounts_embed_token ON public.ghl_subaccounts(embed_token);

-- Create a function to generate random tokens
CREATE OR REPLACE FUNCTION public.generate_embed_token()
RETURNS TEXT AS $$
BEGIN
  RETURN encode(gen_random_bytes(15), 'base64');
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create RLS policy to allow public read access for embed pages
CREATE POLICY "Anyone can view subaccounts by embed_token" 
ON public.ghl_subaccounts 
FOR SELECT 
USING (embed_token IS NOT NULL);

-- Create RLS policy to allow public read access to instances for embed
CREATE POLICY "Anyone can view instances for embed" 
ON public.instances 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.ghl_subaccounts 
    WHERE ghl_subaccounts.id = instances.subaccount_id 
    AND ghl_subaccounts.embed_token IS NOT NULL
  )
);