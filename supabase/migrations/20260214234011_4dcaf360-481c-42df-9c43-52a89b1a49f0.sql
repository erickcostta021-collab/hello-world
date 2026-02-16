
-- 1. Fix cleanup_old_processed_messages missing search_path
CREATE OR REPLACE FUNCTION public.cleanup_old_processed_messages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.ghl_processed_messages
  WHERE created_at < now() - INTERVAL '1 hour';
END;
$$;

-- 2. Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- 3. Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 4. Create has_role function BEFORE policies that use it
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- 5. RLS policies on user_roles
CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

-- 6. Seed admin users from current hardcoded emails
INSERT INTO public.user_roles (user_id, role)
SELECT p.user_id, 'admin'::public.app_role
FROM public.profiles p
WHERE p.email IN ('erickcostta021@gmail.com', 'erickcostta.br@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;

-- 7. Update is_admin() to use user_roles
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
$$;

-- 8. Update get_admin_oauth_credentials to use user_roles
CREATE OR REPLACE FUNCTION public.get_admin_oauth_credentials()
RETURNS TABLE(ghl_client_id text, ghl_client_secret text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT us.ghl_client_id, us.ghl_client_secret
  FROM public.user_settings us
  INNER JOIN public.user_roles ur ON ur.user_id = us.user_id
  WHERE ur.role = 'admin'
    AND us.ghl_client_id IS NOT NULL AND us.ghl_client_secret IS NOT NULL
  ORDER BY us.created_at ASC LIMIT 1
$$;

-- 9. Tighten message_map: remove overly permissive policy
DROP POLICY IF EXISTS "Service role can manage message_map" ON public.message_map;
