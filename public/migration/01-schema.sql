-- ============================================================
-- BRIDGE API - Schema Completo para Migração
-- Gerado em: 2026-02-14
-- ============================================================

-- 1. ENUM TYPES
CREATE TYPE public.instance_status AS ENUM ('connected', 'connecting', 'disconnected');

-- 2. TABLES

-- profiles
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  email TEXT,
  full_name TEXT,
  phone TEXT,
  instance_limit INTEGER NOT NULL DEFAULT 0,
  is_paused BOOLEAN NOT NULL DEFAULT false,
  paused_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- user_settings
CREATE TABLE public.user_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  ghl_agency_token TEXT,
  ghl_client_id TEXT,
  ghl_client_secret TEXT,
  ghl_conversation_provider_id TEXT,
  uazapi_admin_token TEXT,
  uazapi_base_url TEXT,
  global_webhook_url TEXT,
  external_supabase_url TEXT,
  external_supabase_key TEXT,
  external_supabase_pat TEXT,
  shared_from_user_id UUID,
  track_id TEXT DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ghl_subaccounts
CREATE TABLE public.ghl_subaccounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  location_id TEXT NOT NULL,
  account_name TEXT NOT NULL,
  ghl_user_id TEXT,
  ghl_subaccount_token TEXT,
  ghl_access_token TEXT,
  ghl_refresh_token TEXT,
  ghl_token_expires_at TIMESTAMPTZ,
  ghl_token_scopes TEXT,
  company_id TEXT,
  embed_token TEXT UNIQUE,
  oauth_installed_at TIMESTAMPTZ,
  oauth_last_refresh TIMESTAMPTZ,
  skip_outbound BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, location_id)
);

-- instances
CREATE TABLE public.instances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  subaccount_id UUID REFERENCES public.ghl_subaccounts(id),
  instance_name TEXT NOT NULL,
  uazapi_instance_token TEXT NOT NULL,
  uazapi_base_url TEXT,
  instance_status public.instance_status NOT NULL DEFAULT 'disconnected',
  is_official_api BOOLEAN NOT NULL DEFAULT false,
  phone TEXT,
  profile_pic_url TEXT,
  ghl_user_id TEXT,
  webhook_url TEXT,
  ignore_groups BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- cdn_scripts
CREATE TABLE public.cdn_scripts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL,
  version TEXT NOT NULL,
  content TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/javascript',
  subdomain TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  is_obfuscated BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(slug, version)
);

-- registration_requests
CREATE TABLE public.registration_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ghl_contact_phone_mapping
CREATE TABLE public.ghl_contact_phone_mapping (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  original_phone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(contact_id, location_id)
);

-- ghl_processed_messages
CREATE TABLE public.ghl_processed_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- contact_instance_preferences
CREATE TABLE public.contact_instance_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  instance_id UUID NOT NULL REFERENCES public.instances(id),
  lead_phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(contact_id, location_id),
  UNIQUE(lead_phone, location_id)
);

-- message_map
CREATE TABLE public.message_map (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ghl_message_id TEXT NOT NULL,
  uazapi_message_id TEXT,
  location_id TEXT NOT NULL,
  contact_id TEXT,
  message_text TEXT,
  message_type TEXT DEFAULT 'text',
  from_me BOOLEAN DEFAULT false,
  reactions JSONB DEFAULT '[]'::jsonb,
  is_deleted BOOLEAN DEFAULT false,
  is_edited BOOLEAN DEFAULT false,
  original_timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- webhook_metrics
CREATE TABLE public.webhook_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  function_name TEXT NOT NULL,
  status_code INTEGER NOT NULL DEFAULT 200,
  instance_id UUID REFERENCES public.instances(id),
  location_id TEXT,
  error_type TEXT,
  processing_time_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- server_health_alerts
CREATE TABLE public.server_health_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  instance_id UUID REFERENCES public.instances(id),
  instance_name TEXT NOT NULL,
  server_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'offline',
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. INDEXES
CREATE INDEX idx_ghl_subaccounts_embed_token ON public.ghl_subaccounts(embed_token);
CREATE INDEX idx_ghl_subaccounts_location_id ON public.ghl_subaccounts(location_id);
CREATE INDEX idx_ghl_subaccounts_token_expires ON public.ghl_subaccounts(ghl_token_expires_at) WHERE ghl_token_expires_at IS NOT NULL;
CREATE INDEX idx_instances_ghl_user_id ON public.instances(ghl_user_id);
CREATE INDEX idx_instances_subaccount_status ON public.instances(subaccount_id, instance_status);
CREATE INDEX idx_instances_status ON public.instances(instance_status);
CREATE INDEX idx_contact_instance_preferences_lead_phone ON public.contact_instance_preferences(lead_phone, location_id);
CREATE INDEX idx_contact_preferences_contact_location ON public.contact_instance_preferences(contact_id, location_id);
CREATE UNIQUE INDEX uq_contact_instance_preferences_lead_phone_location ON public.contact_instance_preferences(lead_phone, location_id) WHERE lead_phone IS NOT NULL;
CREATE INDEX idx_contact_phone_mapping_phone ON public.ghl_contact_phone_mapping(original_phone, location_id);
CREATE INDEX idx_contact_phone_mapping_contact ON public.ghl_contact_phone_mapping(contact_id, location_id);
CREATE INDEX idx_ghl_processed_messages_message_id ON public.ghl_processed_messages(message_id);
CREATE INDEX idx_ghl_processed_messages_created_at ON public.ghl_processed_messages(created_at);
CREATE INDEX idx_message_map_ghl_id ON public.message_map(ghl_message_id);
CREATE INDEX idx_message_map_uazapi_id ON public.message_map(uazapi_message_id);
CREATE INDEX idx_message_map_location_contact ON public.message_map(location_id, contact_id);
CREATE INDEX idx_webhook_metrics_created_at ON public.webhook_metrics(created_at);
CREATE INDEX idx_webhook_metrics_function ON public.webhook_metrics(function_name);
CREATE INDEX idx_server_health_alerts_user ON public.server_health_alerts(user_id);
CREATE INDEX idx_server_health_alerts_status ON public.server_health_alerts(status);

-- 4. FUNCTIONS

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_embed_token()
RETURNS text LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  RETURN encode(gen_random_bytes(15), 'base64');
END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND email IN ('erickcostta021@gmail.com', 'erickcostta.br@gmail.com')
  )
$$;

CREATE OR REPLACE FUNCTION public.get_admin_oauth_credentials()
RETURNS TABLE(ghl_client_id text, ghl_client_secret text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT us.ghl_client_id, us.ghl_client_secret
  FROM public.user_settings us
  INNER JOIN public.profiles p ON p.user_id = us.user_id
  WHERE p.email IN ('erickcostta021@gmail.com', 'erickcostta.br@gmail.com')
    AND us.ghl_client_id IS NOT NULL AND us.ghl_client_secret IS NOT NULL
  ORDER BY us.created_at ASC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_token_owner(p_agency_token text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT user_id FROM user_settings WHERE ghl_agency_token = p_agency_token AND shared_from_user_id IS NULL
  ORDER BY created_at ASC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_effective_user_id(p_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(shared_from_user_id, p_user_id) FROM user_settings WHERE user_id = p_user_id
$$;

CREATE OR REPLACE FUNCTION public.upsert_subaccounts(p_user_id uuid, p_locations jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  location_record jsonb;
  location_ids text[];
BEGIN
  SELECT array_agg(loc->>'id') INTO location_ids FROM jsonb_array_elements(p_locations) AS loc;
  DELETE FROM ghl_subaccounts
  WHERE user_id = p_user_id AND location_id NOT IN (SELECT unnest(location_ids))
    AND NOT EXISTS (SELECT 1 FROM instances WHERE instances.subaccount_id = ghl_subaccounts.id);
  FOR location_record IN SELECT * FROM jsonb_array_elements(p_locations) LOOP
    INSERT INTO ghl_subaccounts (user_id, location_id, account_name)
    VALUES (p_user_id, location_record->>'id', location_record->>'name')
    ON CONFLICT (user_id, location_id) DO UPDATE SET account_name = EXCLUDED.account_name, updated_at = now();
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email) VALUES (NEW.id, NEW.email);
  INSERT INTO public.user_settings (user_id, track_id) VALUES (NEW.id, gen_random_uuid()::text);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_single_active_cdn_script()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.is_active = true THEN
    UPDATE public.cdn_scripts SET is_active = false WHERE slug = NEW.slug AND id != NEW.id AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_old_processed_messages()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN DELETE FROM public.ghl_processed_messages WHERE created_at < now() - INTERVAL '1 hour'; END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_old_phone_mappings()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN DELETE FROM public.ghl_contact_phone_mapping WHERE updated_at < now() - INTERVAL '30 days'; END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_old_webhook_metrics()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN DELETE FROM public.webhook_metrics WHERE created_at < now() - INTERVAL '7 days'; END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_old_health_alerts()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN DELETE FROM public.server_health_alerts WHERE status = 'recovered' AND resolved_at < now() - INTERVAL '30 days'; END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_old_message_mappings()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN DELETE FROM public.message_map WHERE created_at < now() - INTERVAL '24 hours'; END;
$$;

-- 5. TRIGGER (handle_new_user on auth.users - configure manually no Supabase externo)
-- CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
--   FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger para CDN scripts
CREATE TRIGGER ensure_single_active_cdn
  BEFORE INSERT OR UPDATE ON public.cdn_scripts
  FOR EACH ROW EXECUTE FUNCTION public.ensure_single_active_cdn_script();

-- 6. RLS POLICIES

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_subaccounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cdn_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registration_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_contact_phone_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_processed_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_instance_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.server_health_alerts ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admin can view all profiles" ON public.profiles FOR SELECT USING (is_admin());
CREATE POLICY "Admin can update any profile" ON public.profiles FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admin can delete any profile" ON public.profiles FOR DELETE USING (is_admin());

-- user_settings
CREATE POLICY "Users can view own settings" ON public.user_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own settings" ON public.user_settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own settings" ON public.user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Anyone can view user_settings for embed access" ON public.user_settings FOR SELECT USING (EXISTS (SELECT 1 FROM ghl_subaccounts WHERE ghl_subaccounts.user_id = user_settings.user_id AND ghl_subaccounts.embed_token IS NOT NULL));
CREATE POLICY "Admin can delete any user_settings" ON public.user_settings FOR DELETE USING (is_admin());

-- ghl_subaccounts
CREATE POLICY "Users can view own subaccounts" ON public.ghl_subaccounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own subaccounts" ON public.ghl_subaccounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own subaccounts" ON public.ghl_subaccounts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own subaccounts" ON public.ghl_subaccounts FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Anyone can view subaccounts by embed_token" ON public.ghl_subaccounts FOR SELECT USING (embed_token IS NOT NULL);
CREATE POLICY "Admin can delete any ghl_subaccounts" ON public.ghl_subaccounts FOR DELETE USING (is_admin());
CREATE POLICY "Users can view shared subaccounts" ON public.ghl_subaccounts FOR SELECT USING (user_id = get_effective_user_id(auth.uid()));

-- instances
CREATE POLICY "Users can view own instances" ON public.instances FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own instances" ON public.instances FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own instances" ON public.instances FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own instances" ON public.instances FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Anyone can view instances for embed" ON public.instances FOR SELECT USING (EXISTS (SELECT 1 FROM ghl_subaccounts WHERE ghl_subaccounts.id = instances.subaccount_id AND ghl_subaccounts.embed_token IS NOT NULL));
CREATE POLICY "Anyone can update instances for embed" ON public.instances FOR UPDATE USING (EXISTS (SELECT 1 FROM ghl_subaccounts WHERE ghl_subaccounts.id = instances.subaccount_id AND ghl_subaccounts.embed_token IS NOT NULL)) WITH CHECK (EXISTS (SELECT 1 FROM ghl_subaccounts WHERE ghl_subaccounts.id = instances.subaccount_id AND ghl_subaccounts.embed_token IS NOT NULL));
CREATE POLICY "Admin can delete any instances" ON public.instances FOR DELETE USING (is_admin());
CREATE POLICY "Users can view shared instances" ON public.instances FOR SELECT USING (user_id = get_effective_user_id(auth.uid()));
CREATE POLICY "Users can view own unlinked instances" ON public.instances FOR SELECT USING (auth.uid() = user_id AND subaccount_id IS NULL);
CREATE POLICY "Users can update own unlinked instances" ON public.instances FOR UPDATE USING (auth.uid() = user_id AND subaccount_id IS NULL);

-- cdn_scripts
CREATE POLICY "Anyone can read active cdn scripts" ON public.cdn_scripts FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can manage cdn scripts" ON public.cdn_scripts FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- registration_requests
CREATE POLICY "Anyone can create registration request" ON public.registration_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read registration requests" ON public.registration_requests FOR SELECT USING (true);
CREATE POLICY "Anyone can update registration requests" ON public.registration_requests FOR UPDATE USING (true);

-- ghl_contact_phone_mapping
CREATE POLICY "Service role can manage phone mappings" ON public.ghl_contact_phone_mapping FOR ALL USING (true) WITH CHECK (true);

-- ghl_processed_messages
CREATE POLICY "Service role can manage processed messages" ON public.ghl_processed_messages FOR ALL USING (true) WITH CHECK (true);

-- contact_instance_preferences
CREATE POLICY "Anyone can manage contact preferences for embed" ON public.contact_instance_preferences FOR ALL USING (EXISTS (SELECT 1 FROM instances i JOIN ghl_subaccounts s ON s.id = i.subaccount_id WHERE i.id = contact_instance_preferences.instance_id AND s.embed_token IS NOT NULL)) WITH CHECK (EXISTS (SELECT 1 FROM instances i JOIN ghl_subaccounts s ON s.id = i.subaccount_id WHERE i.id = contact_instance_preferences.instance_id AND s.embed_token IS NOT NULL));
CREATE POLICY "Users can manage own contact preferences" ON public.contact_instance_preferences FOR ALL USING (EXISTS (SELECT 1 FROM instances i WHERE i.id = contact_instance_preferences.instance_id AND i.user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM instances i WHERE i.id = contact_instance_preferences.instance_id AND i.user_id = auth.uid()));

-- message_map
CREATE POLICY "Service role can manage message_map" ON public.message_map FOR ALL USING (true) WITH CHECK (true);

-- webhook_metrics
CREATE POLICY "Admins can view webhook_metrics" ON public.webhook_metrics FOR SELECT USING (is_admin());
CREATE POLICY "Service role can insert webhook_metrics" ON public.webhook_metrics FOR ALL USING (true) WITH CHECK (true);

-- server_health_alerts
CREATE POLICY "Admins can view all alerts" ON public.server_health_alerts FOR SELECT USING (is_admin());
CREATE POLICY "Users can view own alerts" ON public.server_health_alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage alerts" ON public.server_health_alerts FOR ALL USING (true) WITH CHECK (true);

-- 7. STORAGE BUCKETS (executar no SQL Editor do Supabase)
INSERT INTO storage.buckets (id, name, public) VALUES ('ghost-audio', 'ghost-audio', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('email-assets', 'email-assets', true) ON CONFLICT DO NOTHING;
