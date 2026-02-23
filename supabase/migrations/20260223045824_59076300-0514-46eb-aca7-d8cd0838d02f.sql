
INSERT INTO storage.buckets (id, name, public) VALUES ('command-uploads', 'command-uploads', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can upload command images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'command-uploads');

CREATE POLICY "Anyone can read command uploads"
ON storage.objects FOR SELECT
USING (bucket_id = 'command-uploads');
