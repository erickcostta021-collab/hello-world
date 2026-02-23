UPDATE cdn_scripts 
SET content = REPLACE(
  REPLACE(
    content,
    'display:flex;border-bottom:1px solid #e5e7eb;background:#fafafa;',
    'display:flex;flex-wrap:wrap;border-bottom:1px solid #e5e7eb;background:#fafafa;'
  ),
  '.bc-tab { padding:10px 16px;font-size:13px;',
  '.bc-tab { padding:8px 10px;font-size:12px;'
),
updated_at = now()
WHERE slug = 'bridge-button-v1.js'