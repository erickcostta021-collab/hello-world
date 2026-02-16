-- Add is_paused column to profiles table
ALTER TABLE public.profiles ADD COLUMN is_paused boolean NOT NULL DEFAULT false;

-- Add paused_at timestamp to track when user was paused
ALTER TABLE public.profiles ADD COLUMN paused_at timestamp with time zone;