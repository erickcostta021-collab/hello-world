-- Add RLS policy to allow public UPDATE on instances for embed access
-- This allows the embed page to update ghl_user_id when assigning users

CREATE POLICY "Anyone can update instances for embed"
ON public.instances
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM ghl_subaccounts
    WHERE ghl_subaccounts.id = instances.subaccount_id
    AND ghl_subaccounts.embed_token IS NOT NULL
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM ghl_subaccounts
    WHERE ghl_subaccounts.id = instances.subaccount_id
    AND ghl_subaccounts.embed_token IS NOT NULL
  )
);