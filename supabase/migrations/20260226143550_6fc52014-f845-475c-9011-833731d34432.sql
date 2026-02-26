
UPDATE cdn_scripts
SET content = REPLACE(
  content,
  E'container.appendChild(headerDiv);\n\n        var groupjid = extractGroupJid();\n        var locationId = extractLocationId();\n\n        if (!groupjid) {\n            var warn = document.createElement(\'div\');\n            warn.style.cssText = \'padding:16px;background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;color:#92400e;font-size:13px;text-align:center;\';\n            warn.innerHTML = \'⚠️ <strong>Grupo não identificado.</strong><br>Verifique se o campo de email do contato contém o JID do grupo (ex: 120363...@g.us).\';\n            container.appendChild(warn);\n            return;\n        }\n\n        if (!locationId) {\n            var warn2 = document.createElement(\'div\');\n            warn2.style.cssText = \'padding:16px;background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;color:#92400e;font-size:13px;text-align:center;\';\n            warn2.textContent = \'⚠️ Não foi possível identificar a subconta na URL.\';',
  E'container.appendChild(headerDiv);'
),
updated_at = now()
WHERE slug = 'bridge-button-beta.js';
