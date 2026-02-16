
-- Add is_official_api column to instances table
ALTER TABLE public.instances ADD COLUMN is_official_api boolean NOT NULL DEFAULT false;
