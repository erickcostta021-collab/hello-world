ALTER TABLE public.server_health_alerts
  DROP CONSTRAINT server_health_alerts_instance_id_fkey,
  ADD CONSTRAINT server_health_alerts_instance_id_fkey
    FOREIGN KEY (instance_id) REFERENCES public.instances(id) ON DELETE SET NULL;