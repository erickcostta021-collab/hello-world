
-- Update bridge-button-v1.js to v1.2.0: Add button type selectors to #botoes command
-- 1. Replace #botoes field-based definition with customForm: "botoes"
-- 2. Add renderBotoesForm function
-- 3. Add hook for customForm === 'botoes'

UPDATE cdn_scripts
SET content = replace(
  content,
  '{ cmd: "#botoes", desc: "Enviar botões de resposta rápida", fields: [
                    { name: "texto", placeholder: "Texto da mensagem", required: true },
                    { name: "rodapé", placeholder: "Rodapé (opcional)", required: false },
                    { name: "botão 1", placeholder: "Texto do botão 1", required: true },
                    { name: "botão 2", placeholder: "Texto do botão 2 (opcional)", required: false },
                    { name: "botão 3", placeholder: "Texto do botão 3 (opcional)", required: false }
                ], sep: "|", buildCmd: function(vals) {
                    var texto = vals[0];
                    var rodape = vals[1];
                    var btns = [vals[2], vals[3], vals[4]].filter(function(v) { return v; });
                    return "#botoes " + texto + "|" + rodape + "|" + btns.join(",");
                }}',
  '{ cmd: "#botoes", desc: "Enviar botões interativos", customForm: "botoes" }'
),
version = 'v1.2.0',
updated_at = now()
WHERE slug = 'bridge-button-v1.js' AND is_active = true;

-- Add the renderBotoesForm function before renderCarouselForm
UPDATE cdn_scripts
SET content = replace(
  content,
  'renderCarouselForm(container) {',
  'renderBotoesForm(container) {
        container.innerHTML = '''';
        var state = { text: '''', footer: '''', buttons: [{ type: ''reply'', label: '''', value: '''' }] };

        var header = document.createElement(''div'');
        header.style.marginBottom = ''10px'';
        header.innerHTML = ''<span style="font-weight:700;font-size:14px;color:#111827;">Enviar botões interativos</span><span style="font-size:11px;color:#6b7280;font-family:monospace;margin-left:8px;">#botoes</span>'';
        container.appendChild(header);

        var textField = document.createElement(''div'');
        textField.className = ''bc-field'';
        textField.innerHTML = ''<label>texto da mensagem *</label><input type="text" placeholder="Texto da mensagem" data-botoes-text />'';
        container.appendChild(textField);

        var footerField = document.createElement(''div'');
        footerField.className = ''bc-field'';
        footerField.innerHTML = ''<label>rodapé (opcional)</label><input type="text" placeholder="Rodapé" data-botoes-footer />'';
        container.appendChild(footerField);

        var btnsDiv = document.createElement(''div'');
        container.appendChild(btnsDiv);

        function saveBtnState() {
            var btnEls = btnsDiv.querySelectorAll(''[data-botoes-btn-idx]'');
            for (var b = 0; b < btnEls.length; b++) {
                var bi = parseInt(btnEls[b].getAttribute(''data-botoes-btn-idx''));
                var typeEl = btnsDiv.querySelector(''[data-botoes-type="'' + bi + ''"]'');
                var valEl = btnsDiv.querySelector(''[data-botoes-val="'' + bi + ''"]'');
                state.buttons[bi] = { type: typeEl ? typeEl.value : ''reply'', label: btnEls[b].value, value: valEl ? valEl.value : '''' };
            }
        }

        function addBtn() {
            if (state.buttons.length >= 3) return;
            saveBtnState();
            state.buttons.push({ type: ''reply'', label: '''', value: '''' });
            renderBtns();
        }

        function removeBtn(idx) {
            if (state.buttons.length <= 1) return;
            saveBtnState();
            state.buttons.splice(idx, 1);
            renderBtns();
        }

        function renderBtns() {
            btnsDiv.innerHTML = '''';
            for (var bi = 0; bi < state.buttons.length; bi++) {
                var btnData = state.buttons[bi];
                var btnDiv = document.createElement(''div'');
                btnDiv.className = ''bc-field'';
                btnDiv.style.cssText = ''flex-direction:column;gap:4px;padding:8px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:6px;'';
                var btnHeader = document.createElement(''div'');
                btnHeader.style.cssText = ''display:flex;align-items:center;gap:6px;'';
                var label = document.createElement(''label'');
                label.style.cssText = ''min-width:50px;font-size:12px;font-weight:600;color:#374151;'';
                label.textContent = ''botão '' + (bi + 1) + (bi === 0 ? '' *'' : '''');
                var sel = document.createElement(''select'');
                sel.setAttribute(''data-botoes-type'', bi);
                sel.style.cssText = ''border:1px solid #d1d5db;border-radius:6px;padding:4px 8px;font-size:12px;background:#fff;outline:none;cursor:pointer;'';
                sel.innerHTML = ''<option value="reply">💬 Resposta</option><option value="url">🔗 URL</option><option value="copy">📋 Copiar</option><option value="call">📞 Ligar</option>'';
                sel.value = btnData.type || ''reply'';
                btnHeader.appendChild(label);
                btnHeader.appendChild(sel);
                if (bi > 0) {
                    var rmBtn = document.createElement(''button'');
                    rmBtn.textContent = ''✕'';
                    rmBtn.style.cssText = ''background:#fee2e2;color:#dc2626;border:none;border-radius:4px;width:22px;height:22px;cursor:pointer;font-size:11px;flex-shrink:0;margin-left:auto;'';
                    rmBtn.setAttribute(''data-remove-botoes-btn'', bi);
                    btnHeader.appendChild(rmBtn);
                }
                btnDiv.appendChild(btnHeader);
                var inputsRow = document.createElement(''div'');
                inputsRow.style.cssText = ''display:flex;gap:6px;align-items:center;'';
                var inp = document.createElement(''input'');
                inp.type = ''text'';
                inp.placeholder = ''Texto do botão'';
                inp.setAttribute(''data-botoes-btn-idx'', bi);
                inp.value = btnData.label || '''';
                inp.style.cssText = ''flex:1;border:1px solid #d1d5db;border-radius:8px;padding:8px 12px;font-size:13px;outline:none;transition:border .15s;'';
                inputsRow.appendChild(inp);
                var valInput = document.createElement(''input'');
                valInput.type = ''text'';
                valInput.setAttribute(''data-botoes-val'', bi);
                valInput.value = btnData.value || '''';
                valInput.style.cssText = ''flex:1;border:1px solid #d1d5db;border-radius:8px;padding:8px 12px;font-size:13px;outline:none;transition:border .15s;'';
                var btype = btnData.type || ''reply'';
                if (btype === ''reply'') { valInput.style.display = ''none''; }
                else if (btype === ''url'') { valInput.placeholder = ''https://exemplo.com''; }
                else if (btype === ''copy'') { valInput.placeholder = ''Código ou texto para copiar''; }
                else if (btype === ''call'') { valInput.placeholder = ''+5511988888888''; }
                inputsRow.appendChild(valInput);
                btnDiv.appendChild(inputsRow);
                btnsDiv.appendChild(btnDiv);
            }

            if (state.buttons.length < 3) {
                var addBtnBtn = document.createElement(''button'');
                addBtnBtn.textContent = ''+ Botão'';
                addBtnBtn.style.cssText = ''background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;margin-top:2px;'';
                addBtnBtn.setAttribute(''data-add-botoes-btn'', ''1'');
                btnsDiv.appendChild(addBtnBtn);
            }

            btnsDiv.addEventListener(''change'', function(e) {
                var target = e.target;
                if (target.hasAttribute(''data-botoes-type'')) {
                    var bi2 = parseInt(target.getAttribute(''data-botoes-type''));
                    var valInput2 = btnsDiv.querySelector(''[data-botoes-val="'' + bi2 + ''"]'');
                    if (target.value === ''reply'') { valInput2.style.display = ''none''; valInput2.value = ''''; }
                    else { valInput2.style.display = ''''; }
                    if (target.value === ''url'') valInput2.placeholder = ''https://exemplo.com'';
                    else if (target.value === ''copy'') valInput2.placeholder = ''Código ou texto para copiar'';
                    else if (target.value === ''call'') valInput2.placeholder = ''+5511988888888'';
                }
            });

            btnsDiv.addEventListener(''click'', function(e) {
                var target = e.target;
                if (target.hasAttribute(''data-add-botoes-btn'')) { addBtn(); }
                if (target.hasAttribute(''data-remove-botoes-btn'')) { removeBtn(parseInt(target.getAttribute(''data-remove-botoes-btn''))); }
            });
        }

        renderBtns();

        function buildBotoesCmd() {
            saveBtnState();
            var text = container.querySelector(''[data-botoes-text]'').value.trim();
            var footer = container.querySelector(''[data-botoes-footer]'').value.trim();
            if (!text) { container.querySelector(''[data-botoes-text]'').style.borderColor = ''#ef4444''; return null; }
            if (!state.buttons[0] || !state.buttons[0].label.trim()) {
                var b0 = btnsDiv.querySelector(''[data-botoes-btn-idx="0"]'');
                if (b0) b0.style.borderColor = ''#ef4444'';
                return null;
            }
            var btns = state.buttons.filter(function(b) { return b && b.label && b.label.trim(); }).map(function(b) {
                if (b.type === ''url'') return b.label + ''|'' + (b.value || '''');
                if (b.type === ''copy'') return b.label + ''|copy:'' + (b.value || '''');
                if (b.type === ''call'') return b.label + ''|call:'' + (b.value || '''');
                return b.label;
            });
            return ''#botoes '' + text + ''|'' + footer + ''|'' + btns.join('','');
        }

        var sendBtn = document.createElement(''button'');
        sendBtn.className = ''bc-send-btn'';
        sendBtn.innerHTML = ''<span>▶</span> Enviar Botões'';
        sendBtn.addEventListener(''click'', function() {
            var cmd = buildBotoesCmd();
            if (cmd) { sendCommand(cmd); closePopup(); }
        });
        container.appendChild(sendBtn);
    }

    function renderCarouselForm(container) {'
)
WHERE slug = 'bridge-button-v1.js' AND is_active = true;

-- Add the hook for customForm === 'botoes' before the carousel hook
UPDATE cdn_scripts
SET content = replace(
  content,
  'if (cmd.customForm === ''carousel'')',
  'if (cmd.customForm === ''botoes'') {
                renderBotoesForm(card);
                container.appendChild(card);
                return;
            }
            if (cmd.customForm === ''carousel'')'
)
WHERE slug = 'bridge-button-v1.js' AND is_active = true;
