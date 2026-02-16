-- ============================================================
-- DADOS: profiles (8 registros)
-- ============================================================

INSERT INTO public.profiles (id, user_id, email, full_name, phone, instance_limit, is_paused, paused_at, created_at, updated_at) VALUES
('57253e97-30e3-4d39-8d67-b84746165da2', '15588a1e-3669-4d58-b52d-4c2009f96cfa', 'erickcostta021@gmail.com', NULL, NULL, 3, false, NULL, '2026-01-20 18:38:20.901152+00', '2026-02-07 01:08:59.165149+00'),
('29a6dc8a-737a-4f8c-96ce-f4bea0b51d02', '805b7e6c-f577-4946-87e7-016fd54f5f47', 'erickcostahomemaranha@gmail.com', NULL, NULL, 1, false, NULL, '2026-01-24 23:07:32.781749+00', '2026-02-07 22:36:37.116758+00'),
('165d2313-da86-44f9-b2ae-99a1b56323f2', '0942eda5-7df5-41f5-bc14-d087d7b494b5', 'renan@metriksales.com', NULL, NULL, 0, true, '2026-02-10 14:30:53.276+00', '2026-01-27 19:44:58.359241+00', '2026-02-10 14:30:53.399018+00'),
('f9e6c90f-3a57-4cbc-a773-d1e4742c17cc', '010dfa35-88a3-47d6-b649-653479c52c05', 'testt@gmail.com', 'Erick silva da costa', '21980014713', 0, false, NULL, '2026-02-06 05:49:58.450808+00', '2026-02-06 05:49:58.933638+00'),
('4e87163c-970a-4b66-bc0d-99c6e240f1ef', 'ae2ad04f-6e31-4fbb-a020-c55bae472c64', 'contatosalesmetrik@gmail.com', 'OSEIAS SANTOS NASCIMENTO', '85991998371', 10, false, NULL, '2026-02-09 21:04:55.277539+00', '2026-02-13 15:39:48.681295+00'),
('d35952e2-5053-4f89-aba6-e3fb990ffa32', 'aaf7f151-146b-4336-85c7-b03af2ea0a7a', 'rafaelmind77.co@gmail.com', NULL, NULL, 1, false, NULL, '2026-02-09 23:42:56.425764+00', '2026-02-13 15:40:17.619275+00'),
('d5bebb3e-f640-4318-9ff0-ffe18676ed1b', '37f22630-ffd0-4aa3-b402-da33909b3fb1', 'tuunnis@gmail.com', NULL, NULL, 0, false, NULL, '2026-02-10 06:37:16.693307+00', '2026-02-10 06:37:16.693307+00'),
('f43f8431-c78b-4f14-abae-a8a236b26ca4', '4d5b2a6c-e364-4bf3-ac25-84419cd3849c', 'albuquerqueuse@gmail.com', NULL, NULL, 0, false, NULL, '2026-02-10 06:39:21.152337+00', '2026-02-10 06:39:21.152337+00')
ON CONFLICT (id) DO NOTHING;
