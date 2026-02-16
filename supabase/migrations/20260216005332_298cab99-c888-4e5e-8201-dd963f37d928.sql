
-- Fix #1: Remove the overly permissive user_settings embed policy
-- This policy exposes ALL user secrets (API tokens, OAuth credentials) to anyone with an embed_token
DROP POLICY IF EXISTS "Anyone can view user_settings for embed access" ON public.user_settings;
