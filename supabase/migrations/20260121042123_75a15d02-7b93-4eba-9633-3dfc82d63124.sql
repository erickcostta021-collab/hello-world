-- Add RLS policy to allow public access to user_settings when accessing via embed
-- This allows the embed page to fetch UAZAPI configuration

CREATE POLICY "Anyone can view user_settings for embed access"
ON public.user_settings
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM ghl_subaccounts
    WHERE ghl_subaccounts.user_id = user_settings.user_id
    AND ghl_subaccounts.embed_token IS NOT NULL
  )
);