UPDATE cdn_scripts 
SET content = regexp_replace(
  content,
  E'<span style="font-size:15px;">👤</span>'' \\+\n\\s*''<span style="font-size:13px;color:#111827;">'' \\+ p\\.phone \\+ ''</span>',
  E'<span style="font-size:15px;">👤</span>'' +\n                            ''<span style="font-size:13px;color:#111827;font-weight:600;">'' + (p.name || p.phone) + ''</span>'' +\n                            (p.name ? ''<span style="font-size:11px;color:#6b7280;margin-left:6px;">'' + p.phone + ''</span>'' : '''')',
  'g'
),
updated_at = now()
WHERE id = 'ec7a8c6f-62f5-4097-a288-690cb3f3d1b1';