UPDATE cdn_scripts SET content = replace(replace(replace(replace(content,
'margin-bottom:12px;background:#f3f4f6;',
'margin-bottom:12px;background:#2a2a40;'),
'font-weight:700;font-size:14px;color:#111827;',
'font-weight:700;font-size:14px;color:#e0e0e0;'),
'font-size:12px;color:#6b7280;margin:4px 0 0;',
'font-size:12px;color:#8888a0;margin:4px 0 0;'),
'padding:8px 0 6px;margin-bottom:6px;border-top:1px solid #e5e7eb;',
'padding:8px 0 6px;margin-bottom:6px;border-top:1px solid #333348;'
), updated_at = now()
WHERE id = 'ec7a8c6f-62f5-4097-a288-690cb3f3d1b1';