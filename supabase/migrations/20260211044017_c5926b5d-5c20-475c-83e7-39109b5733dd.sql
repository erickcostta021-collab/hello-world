-- Create storage bucket for ghost audio files
INSERT INTO storage.buckets (id, name, public) VALUES ('ghost-audio', 'ghost-audio', true);

-- Allow public read access
CREATE POLICY "Ghost audio files are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'ghost-audio');

-- Allow service role to upload (edge functions use service role)
CREATE POLICY "Service role can upload ghost audio"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'ghost-audio');

-- Allow service role to delete old files
CREATE POLICY "Service role can delete ghost audio"
ON storage.objects FOR DELETE
USING (bucket_id = 'ghost-audio');