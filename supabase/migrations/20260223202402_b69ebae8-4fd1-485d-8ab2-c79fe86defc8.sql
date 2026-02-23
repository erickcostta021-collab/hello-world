
-- Add copy button to renderBotoesForm in bridge-button-v1.js
UPDATE cdn_scripts
SET content = replace(
  content,
  'sendBtn.innerHTML = ''<span>▶</span> Enviar Botões'';
        sendBtn.addEventListener(''click'', function() {
            var cmd = buildBotoesCmd();
            if (cmd) { sendCommand(cmd); closePopup(); }
        });
        container.appendChild(sendBtn);
    }

    function renderCarouselForm(container) {',
  'sendBtn.innerHTML = ''<span>▶</span> Enviar Botões'';
        sendBtn.addEventListener(''click'', function() {
            var cmd = buildBotoesCmd();
            if (cmd) { sendCommand(cmd); closePopup(); }
        });

        var copyBtn = document.createElement(''button'');
        copyBtn.className = ''bc-send-btn'';
        copyBtn.style.cssText = ''background:#f3f4f6;color:#374151;border:1px solid #d1d5db;margin-top:6px;'';
        copyBtn.innerHTML = ''<span>📋</span> Copiar Comando'';
        copyBtn.addEventListener(''click'', function() {
            var cmd = buildBotoesCmd();
            if (cmd) {
                navigator.clipboard.writeText(cmd).then(function() {
                    copyBtn.innerHTML = ''<span>✅</span> Copiado!'';
                    setTimeout(function() { copyBtn.innerHTML = ''<span>📋</span> Copiar Comando''; }, 2000);
                });
            }
        });

        var btnRow = document.createElement(''div'');
        btnRow.style.cssText = ''display:flex;flex-direction:column;gap:0;'';
        btnRow.appendChild(sendBtn);
        btnRow.appendChild(copyBtn);
        container.appendChild(btnRow);
    }

    function renderCarouselForm(container) {'
),
updated_at = now()
WHERE slug = 'bridge-button-v1.js' AND is_active = true;
