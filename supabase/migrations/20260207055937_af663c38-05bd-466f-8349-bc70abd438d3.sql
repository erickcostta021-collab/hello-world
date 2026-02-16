-- Allow instances to exist without being linked to a subaccount
-- Unlinked instances won't count toward the plan limit
ALTER TABLE public.instances ALTER COLUMN subaccount_id DROP NOT NULL;

-- Update the RLS policies that reference subaccount_id to handle NULL values
-- The existing policies already use JOINs which naturally exclude NULL subaccount_id rows