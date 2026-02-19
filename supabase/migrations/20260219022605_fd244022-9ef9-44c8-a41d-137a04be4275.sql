
ALTER TABLE public.contact_instance_preferences
  DROP CONSTRAINT contact_instance_preferences_instance_id_fkey,
  ADD CONSTRAINT contact_instance_preferences_instance_id_fkey
    FOREIGN KEY (instance_id) REFERENCES public.instances(id) ON DELETE CASCADE;
