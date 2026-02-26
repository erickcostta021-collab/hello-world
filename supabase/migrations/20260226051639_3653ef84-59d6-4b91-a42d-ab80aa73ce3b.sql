UPDATE cdn_scripts SET content = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(content,
-- 1. Popup background: white -> dark
'background:#fff;border-radius:16px;width:460px;max-width:92vw;max-height:80vh;',
'background:#1e1e2e;border-radius:16px;width:460px;max-width:92vw;max-height:80vh;'),
-- 2. Header border
'border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;"><h2 style="margin:0;font-size:16px;font-weight:700;color:#111827;">',
'border-bottom:1px solid #333348;display:flex;align-items:center;justify-content:space-between;"><h2 style="margin:0;font-size:16px;font-weight:700;color:#e0e0e0;">'),
-- 3. Tabs bar
'border-bottom:1px solid #e5e7eb;background:#fafafa;"',
'border-bottom:1px solid #333348;background:#16162a;"'),
-- 4. Tab styles in CSS
'.bc-tab:hover { color:#111827;background:#f3f4f6; }',
'.bc-tab:hover { color:#e0e0e0;background:#2a2a40; }'),
-- 5. Tab default color
'.bc-tab { padding:8px 10px;font-size:12px;font-weight:600;cursor:pointer;border:none;background:none;color:#6b7280;',
'.bc-tab { padding:8px 10px;font-size:12px;font-weight:600;cursor:pointer;border:none;background:none;color:#9ca3af;'),
-- 6. Card border
'.bc-cmd-card { padding:12px;border:1px solid #e5e7eb;border-radius:10px;',
'.bc-cmd-card { padding:12px;border:1px solid #333348;border-radius:10px;'),
-- 7. Card hover
'.bc-cmd-card:hover { border-color:#22c55e;box-shadow:0 2px 8px rgba(34,197,94,0.08); }',
'.bc-cmd-card:hover { border-color:#22c55e;box-shadow:0 2px 8px rgba(34,197,94,0.15); }'),
-- 8. Quick btn
'.bc-quick-btn { background:#f3f4f6;border:1px solid #e5e7eb;',
'.bc-quick-btn { background:#2a2a40;border:1px solid #333348;'),
-- 9. Quick btn hover
'.bc-quick-btn:hover { background:#ecfdf5;border-color:#22c55e;color:#16a34a; }',
'.bc-quick-btn:hover { background:#1a3a2a;border-color:#22c55e;color:#22c55e; }'),
-- 10. Field label color
'.bc-field label { font-size:12px;font-weight:600;color:#374151; }',
'.bc-field label { font-size:12px;font-weight:600;color:#c0c0d0; }'),
-- 11. Field input
'.bc-field input { border:1px solid #d1d5db;border-radius:8px;padding:8px 12px;font-size:13px;outline:none;transition:border .15s; }',
'.bc-field input { border:1px solid #333348;border-radius:8px;padding:8px 12px;font-size:13px;outline:none;transition:border .15s;background:#16162a;color:#e0e0e0; }'),
-- 12. Close button hover
E'onmouseover="this.style.background=\\''#f3f4f6\\''"',
E'onmouseover="this.style.background=\\''#2a2a40\\''"'),
-- 13. Close button color
'font-size:20px;color:#9ca3af;padding:4px 8px;',
'font-size:20px;color:#6b7280;padding:4px 8px;'),
-- 14. Member list rows - alternating colors dark
E'var bg = idx % 2 === 0 ? \\''#ffffff\\'' : \\''#f9fafb\\''',
E'var bg = idx % 2 === 0 ? \\''#1e1e2e\\'' : \\''#16162a\\'''),
-- 15. Member name color dark
'font-size:13px;color:#111827;font-weight:600;',
'font-size:13px;color:#e0e0e0;font-weight:600;'),
-- 16. Member list border
'border:1px solid #e5e7eb;border-radius:10px;',
'border:1px solid #333348;border-radius:10px;'
), updated_at = now()
WHERE id = 'ec7a8c6f-62f5-4097-a288-690cb3f3d1b1';