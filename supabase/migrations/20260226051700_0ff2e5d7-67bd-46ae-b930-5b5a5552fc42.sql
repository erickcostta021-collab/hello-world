UPDATE cdn_scripts SET content = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(content,
-- Member row border-bottom
'border-bottom:1px solid #f3f4f6;cursor:pointer;',
'border-bottom:1px solid #333348;cursor:pointer;'),
-- Copy hint text
'font-size:11px;color:#9ca3af;margin-top:6px;text-align:center;">Clique no membro para copiar o número</div>',
'font-size:11px;color:#6b7280;margin-top:6px;text-align:center;">📋 Clique no membro para copiar o número</div>'),
-- Member phone color
'font-size:11px;color:#6b7280;margin-left:6px;',
'font-size:11px;color:#8888a0;margin-left:6px;'),
-- Role badge
'font-size:11px;background:#f0fdf4;border:1px solid #bbf7d0;padding:2px 8px;border-radius:10px;color:#16a34a;',
'font-size:11px;background:#1a3a2a;border:1px solid #22c55e44;padding:2px 8px;border-radius:10px;color:#22c55e;'),
-- Group header success
'padding:10px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;',
'padding:10px 12px;background:#1a3a2a;border:1px solid #22c55e44;border-radius:8px;'),
-- Group header text
'font-weight:600;font-size:13px;color:#16a34a;',
'font-weight:600;font-size:13px;color:#22c55e;'),
-- Members count
'font-size:12px;color:#6b7280;',
'font-size:12px;color:#8888a0;'),
-- Group info box
'padding:8px 12px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;margin-bottom:12px;font-size:12px;color:#0369a1;',
'padding:8px 12px;background:#1a2a3a;border:1px solid #334466;border-radius:8px;margin-bottom:12px;font-size:12px;color:#7db8e0;'),
-- Warning boxes
'padding:16px;background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;color:#92400e;',
'padding:16px;background:#3a2a10;border:1px solid #665522;border-radius:10px;color:#f0c060;'),
-- Error boxes
'padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#dc2626;',
'padding:12px;background:#3a1a1a;border:1px solid #662222;border-radius:8px;color:#f06060;'
), updated_at = now()
WHERE id = 'ec7a8c6f-62f5-4097-a288-690cb3f3d1b1';