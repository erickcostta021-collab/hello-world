UPDATE cdn_scripts 
SET content = REPLACE(
  content,
  'actionBar.appendChild(btn);',
  'var bridgeContainer = actionBar.querySelector(''#bridge-api-container''); if (bridgeContainer) { actionBar.insertBefore(btn, bridgeContainer); } else { actionBar.appendChild(btn); }'
),
updated_at = now()
WHERE slug = 'bridge-button-v1.js' AND is_active = true