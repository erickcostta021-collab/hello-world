UPDATE cdn_scripts 
SET content = REPLACE(
  content,
  E'<span style="font-size:"'' + (p.name ? ''11'' : ''13'') + ''px;color:'' + (p.name ? ''#6b7280'' : ''#111827'') + '';',
  E'<span style="font-size:'' + (p.name ? ''11'' : ''13'') + ''px;color:'' + (p.name ? ''#6b7280'' : ''#111827'') + '';'
),
updated_at = now()
WHERE slug = 'bridge-button-beta.js' AND is_active = true;