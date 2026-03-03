
ALTER TABLE public.webhook_metrics
  DROP CONSTRAINT webhook_metrics_instance_id_fkey;

ALTER TABLE public.webhook_metrics
  ADD CONSTRAINT webhook_metrics_instance_id_fkey
  FOREIGN KEY (instance_id) REFERENCES public.instances(id) ON DELETE CASCADE;
