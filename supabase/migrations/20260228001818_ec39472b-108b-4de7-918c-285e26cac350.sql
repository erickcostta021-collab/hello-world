ALTER TABLE public.instances 
ALTER COLUMN embed_visible_options 
SET DEFAULT '{"token": true, "status": true, "connect": true, "webhook": true, "base_url": true, "messages": true, "track_id": true, "disconnect": true, "assign_user": true, "api_oficial": true}'::jsonb;