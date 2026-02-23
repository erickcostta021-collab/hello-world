
UPDATE cdn_scripts
SET content = replace(
  content,
  'var btnRow = document.createElement(''div'');
        btnRow.style.cssText = ''display:flex;flex-direction:column;gap:0;'';
        btnRow.appendChild(sendBtn);
        btnRow.appendChild(copyBtn);
        container.appendChild(btnRow);',
  'var btnRow = document.createElement(''div'');
        btnRow.style.cssText = ''display:flex;gap:8px;margin-top:12px;'';
        sendBtn.style.cssText += '';flex:1;'';
        copyBtn.style.cssText += '';flex:1;margin-top:0;'';
        btnRow.appendChild(sendBtn);
        btnRow.appendChild(copyBtn);
        container.appendChild(btnRow);'
),
updated_at = now()
WHERE slug = 'bridge-button-v1.js' AND is_active = true;
