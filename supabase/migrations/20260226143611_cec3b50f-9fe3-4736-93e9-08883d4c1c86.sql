
-- Remove leftover warn2 code and infoDiv, and restructure the loadBtn click handler
UPDATE cdn_scripts
SET content = REPLACE(
  content,
  E'container.appendChild(headerDiv);\n            container.appendChild(warn2);\n            return;\n        }\n\n        var infoDiv = document.createElement(\'div\');\n        infoDiv.style.cssText = \'padding:8px 12px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;margin-bottom:12px;font-size:12px;color:#0369a1;\';\n        infoDiv.innerHTML = \'📍 Grupo: <strong>\' + groupjid + \'</strong>\';\n        container.appendChild(infoDiv);\n\n        var loadBtn = document.createElement(\'button\');\n        loadBtn.className = \'bc-send-btn\';\n        loadBtn.style.cssText += \'width:100%;justify-content:center;margin-bottom:12px;\';\n        loadBtn.innerHTML = \'<span>🔍</span> Carregar Membros\';\n        container.appendChild(loadBtn);',
  E'container.appendChild(headerDiv);\n\n        var loadBtn = document.createElement(\'button\');\n        loadBtn.className = \'bc-send-btn\';\n        loadBtn.style.cssText += \'width:100%;justify-content:center;margin-bottom:12px;\';\n        loadBtn.innerHTML = \'<span>🔍</span> Carregar Membros\';\n        container.appendChild(loadBtn);'
),
updated_at = now()
WHERE slug = 'bridge-button-beta.js';
