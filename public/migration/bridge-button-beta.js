// 🎯 BRIDGE COMMANDS: v1.2.0-beta - Interactive command popup for GHL chat (with Group Members)
console.log('🎯 BRIDGE COMMANDS: v1.2.0-beta Iniciado');

try {
(function() {
    const LOG = "[BridgeCmds]";
    let popupOpen = false;

    const UPLOAD_URL = 'https://jtabmlyjgtrgimnhvixb.supabase.co/functions/v1/upload-command-image';

    function isUrlField(field) {
        const n = (field.name || '').toLowerCase();
        const p = (field.placeholder || '').toLowerCase();
        return n.includes('url') || n.includes('foto') || n.includes('imagem') || p.includes('url da');
    }

    // ── Command definitions ──
    const CATEGORIES = [
        {
            name: "Gerenciar Grupos",
            icon: "👥",
            commands: [
                { cmd: "#criargrupo", desc: "Criar novo grupo", fields: [
                    { name: "nome", placeholder: "Nome do grupo", required: true },
                    { name: "participantes", placeholder: "+5511999999999", required: true },
                    { name: "descrição", placeholder: "Descrição (opcional)", required: false },
                    { name: "foto", placeholder: "URL da foto (opcional)", required: false }
                ], sep: "|" },
                { cmd: "#addnogrupo", desc: "Adicionar ao grupo", fields: [
                    { name: "telefone", placeholder: "+5511999999999", required: true }
                ], sep: " " },
                { cmd: "#removerdogrupo", desc: "Remover do grupo", fields: [
                    { name: "telefone", placeholder: "+5511999999999", required: true }
                ], sep: " " },
                { cmd: "#promoveradmin", desc: "Promover a admin", fields: [
                    { name: "telefone", placeholder: "+5511999999999", required: true }
                ], sep: " " },
                { cmd: "#revogaradmin", desc: "Revogar admin", fields: [
                    { name: "telefone", placeholder: "+5511999999999", required: true }
                ], sep: " " },
                { cmd: "#attnomegrupo", desc: "Alterar nome do grupo", fields: [
                    { name: "nome", placeholder: "Novo nome", required: true }
                ], sep: " " },
                { cmd: "#attdescricao", desc: "Alterar descrição", fields: [
                    { name: "descrição", placeholder: "Nova descrição", required: true }
                ], sep: " " },
                { cmd: "#attfotogrupo", desc: "Alterar foto do grupo", fields: [
                    { name: "url", placeholder: "URL da imagem", required: true }
                ], sep: " " },
                { cmd: "#linkgrupo", desc: "Obter link de convite", fields: [
                    { name: "telefone", placeholder: "5511999999999", required: true }
                ], sep: " " },
                { cmd: "#somenteadminmsg", desc: "Só admins enviam mensagens", fields: [] },
                { cmd: "#msgliberada", desc: "Todos enviam mensagens", fields: [] },
                { cmd: "#somenteadminedit", desc: "Só admins editam grupo", fields: [] },
                { cmd: "#editliberado", desc: "Todos editam grupo", fields: [] },
                { cmd: "#sairgrupo", desc: "Sair do grupo", fields: [] },
                { cmd: "__members__", desc: "Listar membros do grupo", fields: [], customAction: "members", icon: "📋" },
            ]
        },
        {
            name: "Enviar Botões",
            icon: "🔘",
            commands: [
                { cmd: "#pix", desc: "Enviar botão PIX", fields: [
                    { name: "tipo", placeholder: "EVP, CPF, CNPJ, PHONE ou EMAIL", required: true },
                    { name: "chave", placeholder: "Chave PIX", required: true },
                    { name: "nome", placeholder: "Nome do beneficiário", required: true }
                ], sep: "|" },
                { cmd: "#botoes", desc: "Enviar botões interativos", customForm: "botoes" },
                { cmd: "#lista", desc: "Enviar lista interativa", fields: [
                    { name: "texto", placeholder: "Texto da mensagem", required: true },
                    { name: "textoBotão", placeholder: "Texto do botão", required: true },
                    { name: "item 1", placeholder: "Item 1", required: true },
                    { name: "item 2", placeholder: "Item 2 (opcional)", required: false },
                    { name: "item 3", placeholder: "Item 3 (opcional)", required: false }
                ], sep: "|", buildCmd: function(vals) {
                    var texto = vals[0];
                    var textoBotao = vals[1];
                    var itens = [vals[2], vals[3], vals[4]].filter(function(v) { return v; });
                    return "#lista " + texto + "|" + textoBotao + "|" + itens.join(",");
                }},
                { cmd: "#enquete", desc: "Enviar enquete/votação", fields: [
                    { name: "pergunta", placeholder: "Pergunta da enquete", required: true },
                    { name: "opção1", placeholder: "Opção 1", required: true },
                    { name: "opção2", placeholder: "Opção 2", required: true },
                    { name: "opção3", placeholder: "Opção 3 (opcional)", required: false }
                ], sep: "|" },
                { cmd: "#lista_menu", desc: "Enviar lista com menu", fields: [
                    { name: "texto", placeholder: "Texto da mensagem", required: true },
                    { name: "rodapé", placeholder: "Rodapé (opcional)", required: false },
                    { name: "textoBotão", placeholder: "Texto do botão", required: true },
                    { name: "nomeSeção", placeholder: "Nome da seção", required: true },
                    { name: "item 1 (nome|id|desc)", placeholder: "Nome|ID|Descrição", required: true },
                    { name: "item 2 (nome|id|desc)", placeholder: "Nome|ID|Descrição (opcional)", required: false },
                    { name: "item 3 (nome|id|desc)", placeholder: "Nome|ID|Descrição (opcional)", required: false }
                ], sep: "|", buildCmd: function(vals) {
                    var texto = vals[0];
                    var rodape = vals[1] || '';
                    var textoBotao = vals[2];
                    var secao = vals[3];
                    var itens = [vals[4], vals[5], vals[6]].filter(function(v) { return v; });
                    return "#lista_menu " + texto + "|" + rodape + "|" + textoBotao + "|[" + secao + "]," + itens.join(",");
                }},
                { cmd: "#carrossel", desc: "Enviar carrossel de cards", customForm: "carousel" },
            ]
        },
        {
            name: "Perfil",
            icon: "👤",
            commands: [
                { cmd: "#nome_perfil", desc: "Alterar nome do perfil", fields: [
                    { name: "nome", placeholder: "Minha Empresa - Atendimento", required: true }
                ], sep: " " },
                { cmd: "#foto_perfil", desc: "Alterar foto do perfil", fields: [
                    { name: "url", placeholder: "URL da imagem (640x640)", required: true }
                ], sep: " " },
            ]
        },
        {
            name: "Trocar Instância",
            icon: "🔄",
            commands: [
                { cmd: "#", desc: "Trocar por telefone", fields: [
                    { name: "telefone", placeholder: "5500900000000", required: true },
                    { name: "mensagem", placeholder: "Mensagem a enviar", required: true }
                ], sep: ":", buildCmd: function(vals) { return "#" + vals[0] + ": " + vals[1]; } },
                { cmd: "#", desc: "Trocar por nome da instância", fields: [
                    { name: "nome", placeholder: "Nome da Instância", required: true },
                    { name: "mensagem", placeholder: "Mensagem a enviar", required: true }
                ], sep: ":", buildCmd: function(vals) { return "#" + vals[0] + ": " + vals[1]; } },
            ]
        },
    ];

    // ── Inject into GHL chat input and send ──
    function sendCommand(text) {
        var inputSelectors = [
            'textarea#conv-composer-textarea-input',
            'input[id^="composer-input-"]',
            'div[contenteditable="true"][data-placeholder]',
            'div[contenteditable="true"].ql-editor',
            'div.ql-editor',
            'textarea.note-input',
            'div[contenteditable="true"]'
        ];
        var input = null;
        for (var s = 0; s < inputSelectors.length; s++) {
            input = document.querySelector(inputSelectors[s]);
            if (input) break;
        }
        if (!input) {
            alert('Não foi possível encontrar o campo de mensagem do GHL.');
            return false;
        }

        if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
            var proto = input.tagName === 'INPUT' ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
            var nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value');
            if (nativeSetter && nativeSetter.set) nativeSetter.set.call(input, text);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
            input.innerHTML = '';
            input.textContent = text;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }

        setTimeout(function() {
            var sendBtn = document.querySelector('button#send-message-button')
                || document.querySelector('button[data-v-step="send-message"]')
                || document.querySelector('button.send-button');
            
            if (!sendBtn) {
                var composer = input.closest('.msg-composer-actions, .flex.flex-row, .relative');
                if (composer) {
                    var btns = composer.querySelectorAll('button');
                    for (var b = 0; b < btns.length; b++) {
                        if (btns[b].querySelector('svg')) {
                            btns[b].click();
                            console.log(LOG, '✅ Command sent via composer button');
                            return;
                        }
                    }
                }
            }
            
            if (sendBtn) {
                sendBtn.click();
                console.log(LOG, '✅ Command sent!');
            } else {
                input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
                console.log(LOG, '✅ Command sent via Enter key');
            }
        }, 200);

        return true;
    }

    // ── Build command string from fields ──
    function buildCommandString(command, fieldValues) {
        if (command.buildCmd) {
            return command.buildCmd(fieldValues);
        }
        if (!command.fields || command.fields.length === 0) {
            return command.cmd;
        }
        var values = [];
        for (var i = 0; i < fieldValues.length; i++) {
            if (fieldValues[i] || (command.fields[i] && command.fields[i].required)) {
                values.push(fieldValues[i]);
            }
        }
        return command.cmd + " " + values.join(command.sep || "|");
    }

    // ── Dynamic carousel form ──
    function renderBotoesForm(container) {
        container.innerHTML = '';
        var state = { text: '', footer: '', buttons: [{ type: 'reply', label: '', value: '' }] };

        var header = document.createElement('div');
        header.style.marginBottom = '10px';
        header.innerHTML = '<span style="font-weight:700;font-size:14px;color:#111827;">Enviar botões interativos</span><span style="font-size:11px;color:#6b7280;font-family:monospace;margin-left:8px;">#botoes</span>';
        container.appendChild(header);

        var textField = document.createElement('div');
        textField.className = 'bc-field';
        textField.innerHTML = '<label>texto da mensagem *</label><input type="text" placeholder="Texto da mensagem" data-botoes-text />';
        container.appendChild(textField);

        var footerField = document.createElement('div');
        footerField.className = 'bc-field';
        footerField.innerHTML = '<label>rodapé (opcional)</label><input type="text" placeholder="Rodapé" data-botoes-footer />';
        container.appendChild(footerField);

        var btnsDiv = document.createElement('div');
        container.appendChild(btnsDiv);

        function saveBtnState() {
            var btnEls = btnsDiv.querySelectorAll('[data-botoes-btn-idx]');
            for (var b = 0; b < btnEls.length; b++) {
                var bi = parseInt(btnEls[b].getAttribute('data-botoes-btn-idx'));
                var typeEl = btnsDiv.querySelector('[data-botoes-type="' + bi + '"]');
                var valEl = btnsDiv.querySelector('[data-botoes-val="' + bi + '"]');
                state.buttons[bi] = { type: typeEl ? typeEl.value : 'reply', label: btnEls[b].value, value: valEl ? valEl.value : '' };
            }
        }

        function addBtn() {
            if (state.buttons.length >= 3) return;
            saveBtnState();
            state.buttons.push({ type: 'reply', label: '', value: '' });
            renderBtns();
        }

        function removeBtn(idx) {
            if (state.buttons.length <= 1) return;
            saveBtnState();
            state.buttons.splice(idx, 1);
            renderBtns();
        }

        function renderBtns() {
            btnsDiv.innerHTML = '';
            for (var bi = 0; bi < state.buttons.length; bi++) {
                var btnData = state.buttons[bi];
                var btnDiv = document.createElement('div');
                btnDiv.className = 'bc-field';
                btnDiv.style.cssText = 'flex-direction:column;gap:4px;padding:8px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:6px;';
                var btnHeader = document.createElement('div');
                btnHeader.style.cssText = 'display:flex;align-items:center;gap:6px;';
                var label = document.createElement('label');
                label.style.cssText = 'min-width:50px;font-size:12px;font-weight:600;color:#374151;';
                label.textContent = 'botão ' + (bi + 1) + (bi === 0 ? ' *' : '');
                var sel = document.createElement('select');
                sel.setAttribute('data-botoes-type', bi);
                sel.style.cssText = 'border:1px solid #d1d5db;border-radius:6px;padding:4px 8px;font-size:12px;background:#fff;outline:none;cursor:pointer;';
                sel.innerHTML = '<option value="reply">💬 Resposta</option><option value="url">🔗 URL</option><option value="copy">📋 Copiar</option><option value="call">📞 Ligar</option>';
                sel.value = btnData.type || 'reply';
                btnHeader.appendChild(label);
                btnHeader.appendChild(sel);
                if (bi > 0) {
                    var rmBtn = document.createElement('button');
                    rmBtn.textContent = '✕';
                    rmBtn.style.cssText = 'background:#fee2e2;color:#dc2626;border:none;border-radius:4px;width:22px;height:22px;cursor:pointer;font-size:11px;flex-shrink:0;margin-left:auto;';
                    rmBtn.setAttribute('data-remove-botoes-btn', bi);
                    btnHeader.appendChild(rmBtn);
                }
                btnDiv.appendChild(btnHeader);
                var inputsRow = document.createElement('div');
                inputsRow.style.cssText = 'display:flex;gap:6px;align-items:center;';
                var inp = document.createElement('input');
                inp.type = 'text';
                inp.placeholder = 'Texto do botão';
                inp.setAttribute('data-botoes-btn-idx', bi);
                inp.value = btnData.label || '';
                inp.style.cssText = 'flex:1;border:1px solid #d1d5db;border-radius:8px;padding:8px 12px;font-size:13px;outline:none;transition:border .15s;';
                inputsRow.appendChild(inp);
                var valInput = document.createElement('input');
                valInput.type = 'text';
                valInput.setAttribute('data-botoes-val', bi);
                valInput.value = btnData.value || '';
                valInput.style.cssText = 'flex:1;border:1px solid #d1d5db;border-radius:8px;padding:8px 12px;font-size:13px;outline:none;transition:border .15s;';
                var btype = btnData.type || 'reply';
                if (btype === 'reply') { valInput.style.display = 'none'; }
                else if (btype === 'url') { valInput.placeholder = 'https://exemplo.com'; }
                else if (btype === 'copy') { valInput.placeholder = 'Código ou texto para copiar'; }
                else if (btype === 'call') { valInput.placeholder = '+5511988888888'; }
                inputsRow.appendChild(valInput);
                btnDiv.appendChild(inputsRow);
                btnsDiv.appendChild(btnDiv);
            }

            if (state.buttons.length < 3) {
                var addBtnBtn = document.createElement('button');
                addBtnBtn.textContent = '+ Botão';
                addBtnBtn.style.cssText = 'background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;margin-top:2px;';
                addBtnBtn.setAttribute('data-add-botoes-btn', '1');
                btnsDiv.appendChild(addBtnBtn);
            }

            btnsDiv.addEventListener('change', function(e) {
                var target = e.target;
                if (target.hasAttribute('data-botoes-type')) {
                    var bi2 = parseInt(target.getAttribute('data-botoes-type'));
                    var valInput2 = btnsDiv.querySelector('[data-botoes-val="' + bi2 + '"]');
                    if (target.value === 'reply') { valInput2.style.display = 'none'; valInput2.value = ''; }
                    else { valInput2.style.display = ''; }
                    if (target.value === 'url') valInput2.placeholder = 'https://exemplo.com';
                    else if (target.value === 'copy') valInput2.placeholder = 'Código ou texto para copiar';
                    else if (target.value === 'call') valInput2.placeholder = '+5511988888888';
                }
            });

            btnsDiv.addEventListener('click', function(e) {
                var target = e.target;
                if (target.hasAttribute('data-add-botoes-btn')) { addBtn(); }
                if (target.hasAttribute('data-remove-botoes-btn')) { removeBtn(parseInt(target.getAttribute('data-remove-botoes-btn'))); }
            });
        }

        renderBtns();

        function buildBotoesCmd() {
            saveBtnState();
            var text = container.querySelector('[data-botoes-text]').value.trim();
            var footer = container.querySelector('[data-botoes-footer]').value.trim();
            if (!text) { container.querySelector('[data-botoes-text]').style.borderColor = '#ef4444'; return null; }
            if (!state.buttons[0] || !state.buttons[0].label.trim()) {
                var b0 = btnsDiv.querySelector('[data-botoes-btn-idx="0"]');
                if (b0) b0.style.borderColor = '#ef4444';
                return null;
            }
            var btns = state.buttons.filter(function(b) { return b && b.label && b.label.trim(); }).map(function(b) {
                if (b.type === 'url') return b.label + '|' + (b.value || '');
                if (b.type === 'copy') return b.label + '|copy:' + (b.value || '');
                if (b.type === 'call') return b.label + '|call:' + (b.value || '');
                return b.label;
            });
            return '#botoes ' + text + '|' + footer + '|' + btns.join(',');
        }

        var sendBtn = document.createElement('button');
        sendBtn.className = 'bc-send-btn';
        sendBtn.innerHTML = '<span>▶</span> Enviar Botões';
        sendBtn.addEventListener('click', function() {
            var cmd = buildBotoesCmd();
            if (cmd) { sendCommand(cmd); closePopup(); }
        });

        var copyBtn = document.createElement('button');
        copyBtn.className = 'bc-send-btn';
        copyBtn.style.cssText = 'background:#f3f4f6;color:#374151;border:1px solid #d1d5db;margin-top:6px;';
        copyBtn.innerHTML = '<span>📋</span> Copiar Comando';
        copyBtn.addEventListener('click', function() {
            var cmd = buildBotoesCmd();
            if (cmd) {
                navigator.clipboard.writeText(cmd).then(function() {
                    copyBtn.innerHTML = '<span>✅</span> Copiado!';
                    setTimeout(function() { copyBtn.innerHTML = '<span>📋</span> Copiar Comando'; }, 2000);
                });
            }
        });

        var btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:8px;margin-top:12px;';
        sendBtn.style.cssText += ';flex:1;';
        copyBtn.style.cssText += ';flex:1;margin-top:0;';
        btnRow.appendChild(sendBtn);
        btnRow.appendChild(copyBtn);
        container.appendChild(btnRow);
    }

    function renderCarouselForm(container) {
        container.innerHTML = '';
        var state = { text: '', cards: [{ title: '', image: '', body: '', buttons: [{ type: 'reply', label: '', value: '' }] }] };

        // Header
        var header = document.createElement('div');
        header.style.marginBottom = '10px';
        header.innerHTML = '<span style="font-weight:700;font-size:14px;color:#111827;">Enviar carrossel de cards</span><span style="font-size:11px;color:#6b7280;font-family:monospace;margin-left:8px;">#carrossel</span>';
        container.appendChild(header);

        // Text field
        var textField = document.createElement('div');
        textField.className = 'bc-field';
        textField.innerHTML = '<label>texto da mensagem *</label><input type="text" placeholder="Texto principal do carrossel" />';
        container.appendChild(textField);
        var textInput = textField.querySelector('input');

        // Cards container
        var cardsDiv = document.createElement('div');
        container.appendChild(cardsDiv);

        function saveCardState() {
            var cardEls = cardsDiv.querySelectorAll('[data-card-idx]');
            for (var c = 0; c < cardEls.length; c++) {
                var ci = parseInt(cardEls[c].getAttribute('data-card-idx'));
                if (!state.cards[ci]) continue;
                var ti = cardEls[c].querySelector('[data-cr-title]');
                var im = cardEls[c].querySelector('[data-cr-image]');
                var bo = cardEls[c].querySelector('[data-cr-body]');
                if (ti) state.cards[ci].title = ti.value;
                if (im) state.cards[ci].image = im.value;
                if (bo) state.cards[ci].body = bo.value;
                var btnInputs = cardEls[c].querySelectorAll('[data-btn-idx]');
                for (var b = 0; b < btnInputs.length; b++) {
                    var bi = parseInt(btnInputs[b].getAttribute('data-btn-idx'));
                    var typeEl = cardEls[c].querySelector('[data-btn-type="' + ci + '-' + bi + '"]');
                    var valEl = cardEls[c].querySelector('[data-btn-val="' + bi + '"]');
                    state.cards[ci].buttons[bi] = { type: typeEl ? typeEl.value : 'reply', label: btnInputs[b].value, value: valEl ? valEl.value : '' };
                }
            }
        }

        function addCard() {
            if (state.cards.length >= 10) return;
            saveCardState();
            state.cards.push({ title: '', image: '', body: '', buttons: [{ type: 'reply', label: '', value: '' }] });
            renderCards();
        }

        function removeCard(idx) {
            if (state.cards.length <= 1) return;
            saveCardState();
            state.cards.splice(idx, 1);
            renderCards();
        }

        function addButton(cardIdx) {
            saveCardState();
            state.cards[cardIdx].buttons.push({ type: 'reply', label: '', value: '' });
            renderCards();
        }

        function removeButton(cardIdx, btnIdx) {
            if (state.cards[cardIdx].buttons.length <= 1) return;
            saveCardState();
            state.cards[cardIdx].buttons.splice(btnIdx, 1);
            renderCards();
        }

        function wireUpload(uploadBtn, fileInput, imgInput, ci) {
            uploadBtn.addEventListener('click', function() { fileInput.click(); });
            fileInput.addEventListener('change', function() {
                var file = fileInput.files[0];
                if (!file) return;
                if (file.size > 5 * 1024 * 1024) { alert('Arquivo muito grande (máx 5MB)'); return; }
                uploadBtn.classList.add('uploading');
                uploadBtn.textContent = '⏳';
                var fd = new FormData();
                fd.append('file', file);
                fetch(UPLOAD_URL, { method: 'POST', body: fd })
                    .then(function(res) { return res.json(); })
                    .then(function(data) {
                        if (data.url) {
                            imgInput.value = data.url;
                            state.cards[ci].image = data.url;
                            uploadBtn.textContent = '✅';
                            setTimeout(function() { uploadBtn.textContent = '📷'; }, 2000);
                        } else {
                            alert('Erro no upload: ' + (data.error || 'desconhecido'));
                            uploadBtn.textContent = '📷';
                        }
                    })
                    .catch(function(e) {
                        alert('Erro no upload: ' + e.message);
                        uploadBtn.textContent = '📷';
                    })
                    .finally(function() {
                        uploadBtn.classList.remove('uploading');
                        fileInput.value = '';
                    });
            });
        }

        function renderCards() {
            cardsDiv.innerHTML = '';
            for (var ci = 0; ci < state.cards.length; ci++) {
                var card = state.cards[ci];
                var cardEl = document.createElement('div');
                cardEl.setAttribute('data-card-idx', ci);
                cardEl.style.cssText = 'border:1px solid #d1d5db;border-radius:10px;padding:12px;margin:8px 0;background:#fafafa;';

                // Card header
                var cardHeader = document.createElement('div');
                cardHeader.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;';
                cardHeader.innerHTML = '<span style="font-weight:600;font-size:13px;color:#374151;">📄 Card ' + (ci + 1) + '</span>';
                if (state.cards.length > 1) {
                    var removeBtn = document.createElement('button');
                    removeBtn.textContent = '✕';
                    removeBtn.style.cssText = 'background:#fee2e2;color:#dc2626;border:none;border-radius:6px;width:24px;height:24px;cursor:pointer;font-size:12px;';
                    removeBtn.setAttribute('data-remove-card', ci);
                    cardHeader.appendChild(removeBtn);
                }
                cardEl.appendChild(cardHeader);

                // Title
                var titleDiv = document.createElement('div');
                titleDiv.className = 'bc-field';
                titleDiv.innerHTML = '<label>título *</label><input type="text" placeholder="Título do card" data-cr-title />';
                titleDiv.querySelector('input').value = card.title;
                cardEl.appendChild(titleDiv);

                // Image with upload
                var imgDiv = document.createElement('div');
                imgDiv.className = 'bc-field';
                imgDiv.innerHTML = '<label>imagem *</label><div class="bc-url-wrap"><input type="text" placeholder="URL da imagem" data-cr-image /><button type="button" class="bc-upload-btn" title="Upload imagem">📷</button><input type="file" accept="image/*" style="display:none;" /></div>';
                imgDiv.querySelector('[data-cr-image]').value = card.image;
                wireUpload(
                    imgDiv.querySelector('.bc-upload-btn'),
                    imgDiv.querySelector('input[type="file"]'),
                    imgDiv.querySelector('[data-cr-image]'),
                    ci
                );
                cardEl.appendChild(imgDiv);

                // Body
                var bodyDiv = document.createElement('div');
                bodyDiv.className = 'bc-field';
                bodyDiv.innerHTML = '<label>descrição</label><input type="text" placeholder="Descrição do card (opcional)" data-cr-body />';
                bodyDiv.querySelector('input').value = card.body;
                cardEl.appendChild(bodyDiv);

                // Buttons
                for (var bi = 0; bi < card.buttons.length; bi++) {
                    var btnData = card.buttons[bi];
                    if (typeof btnData === 'string') { btnData = { type: 'reply', label: btnData, value: '' }; state.cards[ci].buttons[bi] = btnData; }
                    var btnDiv = document.createElement('div');
                    btnDiv.className = 'bc-field';
                    btnDiv.style.cssText = 'flex-direction:column;gap:4px;padding:8px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:6px;';
                    var btnHeader = document.createElement('div');
                    btnHeader.style.cssText = 'display:flex;align-items:center;gap:6px;';
                    var label = document.createElement('label');
                    label.style.cssText = 'min-width:50px;font-size:12px;font-weight:600;color:#374151;';
                    label.textContent = 'botão ' + (bi + 1) + (bi === 0 ? ' *' : '');
                    var sel = document.createElement('select');
                    sel.setAttribute('data-btn-type', ci + '-' + bi);
                    sel.style.cssText = 'border:1px solid #d1d5db;border-radius:6px;padding:4px 8px;font-size:12px;background:#fff;outline:none;cursor:pointer;';
                    sel.innerHTML = '<option value="reply">💬 Resposta</option><option value="url">🔗 URL</option><option value="copy">📋 Copiar</option><option value="call">📞 Ligar</option>';
                    sel.value = btnData.type || 'reply';
                    btnHeader.appendChild(label);
                    btnHeader.appendChild(sel);
                    if (bi > 0) {
                        var rmBtn = document.createElement('button');
                        rmBtn.textContent = '✕';
                        rmBtn.style.cssText = 'background:#fee2e2;color:#dc2626;border:none;border-radius:4px;width:22px;height:22px;cursor:pointer;font-size:11px;flex-shrink:0;margin-left:auto;';
                        rmBtn.setAttribute('data-remove-btn', ci + '-' + bi);
                        btnHeader.appendChild(rmBtn);
                    }
                    btnDiv.appendChild(btnHeader);
                    var inputsRow = document.createElement('div');
                    inputsRow.style.cssText = 'display:flex;gap:6px;align-items:center;';
                    var inp = document.createElement('input');
                    inp.type = 'text';
                    inp.placeholder = 'Texto do botão';
                    inp.setAttribute('data-btn-idx', bi);
                    inp.value = btnData.label || '';
                    inp.style.cssText = 'flex:1;border:1px solid #d1d5db;border-radius:8px;padding:8px 12px;font-size:13px;outline:none;transition:border .15s;';
                    inputsRow.appendChild(inp);
                    var valInput = document.createElement('input');
                    valInput.type = 'text';
                    valInput.setAttribute('data-btn-val', bi);
                    valInput.value = btnData.value || '';
                    valInput.style.cssText = 'flex:1;border:1px solid #d1d5db;border-radius:8px;padding:8px 12px;font-size:13px;outline:none;transition:border .15s;';
                    var btype = btnData.type || 'reply';
                    if (btype === 'reply') { valInput.style.display = 'none'; }
                    else if (btype === 'url') { valInput.placeholder = 'https://exemplo.com'; }
                    else if (btype === 'copy') { valInput.placeholder = 'Código ou texto para copiar'; }
                    else if (btype === 'call') { valInput.placeholder = '+5511988888888'; }
                    inputsRow.appendChild(valInput);
                    btnDiv.appendChild(inputsRow);
                    cardEl.appendChild(btnDiv);
                }

                // Add button btn
                if (card.buttons.length < 5) {
                    var addBtnBtn = document.createElement('button');
                    addBtnBtn.textContent = '+ Botão';
                    addBtnBtn.style.cssText = 'background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;border-radius:6px;padding:4px 10px;font-size:12px;cursor:pointer;margin-top:2px;';
                    addBtnBtn.setAttribute('data-add-btn', ci);
                    cardEl.appendChild(addBtnBtn);
                }

                cardsDiv.appendChild(cardEl);
            }

            // Wire select change for button types
            cardsDiv.addEventListener('change', function(e) {
                var target = e.target;
                if (target.hasAttribute('data-btn-type')) {
                    var parts = target.getAttribute('data-btn-type').split('-');
                    var ci2 = parseInt(parts[0]);
                    var bi2 = parseInt(parts[1]);
                    var cardEl2 = cardsDiv.querySelector('[data-card-idx="' + ci2 + '"]');
                    var valInput2 = cardEl2.querySelector('[data-btn-val="' + bi2 + '"]');
                    if (target.value === 'reply') { valInput2.style.display = 'none'; valInput2.value = ''; }
                    else { valInput2.style.display = ''; }
                    if (target.value === 'url') valInput2.placeholder = 'https://exemplo.com';
                    else if (target.value === 'copy') valInput2.placeholder = 'Código ou texto para copiar';
                    else if (target.value === 'call') valInput2.placeholder = '+5511988888888';
                }
            });

            // Wire card-level events via delegation
            cardsDiv.onclick = function(e) {
                var target = e.target;
                if (target.hasAttribute('data-remove-card')) {
                    removeCard(parseInt(target.getAttribute('data-remove-card')));
                } else if (target.hasAttribute('data-remove-btn')) {
                    var parts = target.getAttribute('data-remove-btn').split('-');
                    removeButton(parseInt(parts[0]), parseInt(parts[1]));
                } else if (target.hasAttribute('data-add-btn')) {
                    addButton(parseInt(target.getAttribute('data-add-btn')));
                }
            };
        }

        renderCards();

        // Add card button
        var addCardDiv = document.createElement('div');
        addCardDiv.style.cssText = 'margin:8px 0;';
        var addCardBtn = document.createElement('button');
        addCardBtn.textContent = '+ Adicionar Card';
        addCardBtn.style.cssText = 'background:#ecfdf5;color:#16a34a;border:1px dashed #22c55e;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;width:100%;transition:background .15s;';
        addCardBtn.addEventListener('mouseover', function() { addCardBtn.style.background = '#d1fae5'; });
        addCardBtn.addEventListener('mouseout', function() { addCardBtn.style.background = '#ecfdf5'; });
        addCardBtn.addEventListener('click', addCard);
        addCardDiv.appendChild(addCardBtn);
        container.appendChild(addCardDiv);

        // Limit info
        var info = document.createElement('div');
        info.style.cssText = 'font-size:11px;color:#9ca3af;margin:4px 0 8px;';
        info.textContent = 'Máximo: 10 cards, 5 botões por card';
        container.appendChild(info);

        // Send/Copy buttons
        var actionsDiv = document.createElement('div');
        actionsDiv.style.cssText = 'display:flex;gap:8px;margin-top:4px;';
        actionsDiv.innerHTML = '<button class="bc-send-btn"><span>📩</span> Enviar</button><button class="bc-copy-btn" style="background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;transition:all .15s;display:flex;align-items:center;gap:6px;"><span>📋</span> Copiar</button>';
        container.appendChild(actionsDiv);

        function buildCarouselCmd() {
            saveCardState();
            var text = textInput.value.trim();
            if (!text) { textInput.style.borderColor = '#ef4444'; return null; }
            textInput.style.borderColor = '#d1d5db';

            var valid = true;
            var cardParts = [];
            for (var ci = 0; ci < state.cards.length; ci++) {
                var c = state.cards[ci];
                var cardEl = cardsDiv.querySelector('[data-card-idx="' + ci + '"]');
                if (!c.title) { var t = cardEl.querySelector('[data-cr-title]'); if (t) t.style.borderColor = '#ef4444'; valid = false; }
                if (!c.image) { var m = cardEl.querySelector('[data-cr-image]'); if (m) m.style.borderColor = '#ef4444'; valid = false; }
                /* body is optional */
                if (!c.buttons[0] || !c.buttons[0].label) { var btn0 = cardEl.querySelector('[data-btn-idx="0"]'); if (btn0) btn0.style.borderColor = '#ef4444'; valid = false; }
                var btns = c.buttons.filter(function(b) { return b && b.label && b.label.trim(); }).map(function(b) { if (b.type === 'url') return b.label + '|' + (b.value || ''); if (b.type === 'copy') return b.label + '|copy:' + (b.value || ''); if (b.type === 'call') return b.label + '|call:' + (b.value || ''); return b.label; });
                cardParts.push('[' + c.title + (c.body ? '\\n' + c.body : '') + '],' + c.image + ',' + btns.join(','));
            }

            if (!valid) return null;
            return '#carrossel ' + text + '|' + cardParts.join('|');
        }

        actionsDiv.querySelector('.bc-send-btn').addEventListener('click', function() {
            var cmd = buildCarouselCmd();
            if (cmd) {
                console.log(LOG, 'Sending:', cmd);
                if (sendCommand(cmd)) closePopup();
            }
        });

        actionsDiv.querySelector('.bc-copy-btn').addEventListener('click', function() {
            var cmd = buildCarouselCmd();
            if (cmd) {
                navigator.clipboard.writeText(cmd).then(function() {
                    var copyBtn = actionsDiv.querySelector('.bc-copy-btn');
                    copyBtn.innerHTML = '<span>✅</span> Copiado!';
                    setTimeout(function() { copyBtn.innerHTML = '<span>📋</span> Copiar'; }, 1500);
                });
            }
        });
    }

    // ── Extract groupjid from email field ──
    function extractGroupJid() {
        var inputs = document.querySelectorAll('input.hr-input__input-el, input[type="text"], input[type="email"]');
        for (var i = 0; i < inputs.length; i++) {
            var val = (inputs[i].value || '').trim();
            if (val.includes('@g.us')) return val;
        }
        var allInputs = document.querySelectorAll('input');
        for (var j = 0; j < allInputs.length; j++) {
            var v = (allInputs[j].value || '').trim();
            if (/^\d+@g\.us$/.test(v)) return v;
        }
        return null;
    }

    // ── Extract locationId from URL ──
    function extractLocationId() {
        var match = window.location.href.match(/location[_/]?([a-zA-Z0-9]+)/i);
        return match ? match[1] : null;
    }

    // ── Render Members Tab ──
    function renderMembersTab(container) {
        container.innerHTML = '';

        var backBtn = document.createElement('button');
        backBtn.className = 'bc-quick-btn';
        backBtn.style.cssText += 'margin-bottom:12px;background:#f3f4f6;';
        backBtn.innerHTML = '<span>◀</span> Voltar para Gerenciar Grupos';
        backBtn.addEventListener('click', function() { renderCategory(0); });
        container.appendChild(backBtn);

        var headerDiv = document.createElement('div');
        headerDiv.style.cssText = 'margin-bottom:12px;';
        headerDiv.innerHTML = '<span style="font-weight:700;font-size:14px;color:#111827;">👥 Membros do Grupo</span><p style="font-size:12px;color:#6b7280;margin:4px 0 0;">Lista os participantes do grupo atual.</p>';
        container.appendChild(headerDiv);

        var groupjid = extractGroupJid();
        var locationId = extractLocationId();

        if (!groupjid) {
            var warn = document.createElement('div');
            warn.style.cssText = 'padding:16px;background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;color:#92400e;font-size:13px;text-align:center;';
            warn.innerHTML = '⚠️ <strong>Grupo não identificado.</strong><br>Verifique se o campo de email do contato contém o JID do grupo (ex: 120363...@g.us).';
            container.appendChild(warn);
            return;
        }

        if (!locationId) {
            var warn2 = document.createElement('div');
            warn2.style.cssText = 'padding:16px;background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;color:#92400e;font-size:13px;text-align:center;';
            warn2.textContent = '⚠️ Não foi possível identificar a subconta na URL.';
            container.appendChild(warn2);
            return;
        }

        var infoDiv = document.createElement('div');
        infoDiv.style.cssText = 'padding:8px 12px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;margin-bottom:12px;font-size:12px;color:#0369a1;';
        infoDiv.innerHTML = '📍 Grupo: <strong>' + groupjid + '</strong>';
        container.appendChild(infoDiv);

        var loadBtn = document.createElement('button');
        loadBtn.className = 'bc-send-btn';
        loadBtn.style.cssText += 'width:100%;justify-content:center;margin-bottom:12px;';
        loadBtn.innerHTML = '<span>🔍</span> Carregar Membros';
        container.appendChild(loadBtn);

        var resultDiv = document.createElement('div');
        resultDiv.id = 'bc-members-result';
        container.appendChild(resultDiv);

        loadBtn.addEventListener('click', function() {
            loadBtn.disabled = true;
            loadBtn.innerHTML = '<span>⏳</span> Carregando...';
            resultDiv.innerHTML = '';

            // Get selected instance ID from bridge-switcher dropdown
            var switcherSelect = document.getElementById('bridge-instance-selector');
            var selectedInstanceId = switcherSelect ? switcherSelect.value : null;

            var bodyPayload = { groupjid: groupjid };
            if (selectedInstanceId && selectedInstanceId !== '...') {
                bodyPayload.instanceId = selectedInstanceId;
            } else {
                bodyPayload.locationId = locationId;
            }

            var url = 'https://jtabmlyjgtrgimnhvixb.supabase.co/functions/v1/list-groups';
            fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0YWJtbHlqZ3RyZ2ltbmh2aXhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMjM0MTYsImV4cCI6MjA4NDY5OTQxNn0.UmypVGfLvhgP_RNIYsIXL4Bd8xo6SXRb0noVVLDPk8E',
                    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0YWJtbHlqZ3RyZ2ltbmh2aXhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMjM0MTYsImV4cCI6MjA4NDY5OTQxNn0.UmypVGfLvhgP_RNIYsIXL4Bd8xo6SXRb0noVVLDPk8E'
                },
                body: JSON.stringify(bodyPayload)
            })
            .then(function(res) { return res.json(); })
            .then(function(data) {
                loadBtn.disabled = false;
                loadBtn.innerHTML = '<span>🔄</span> Recarregar';

                if (!data.success || !data.participants) {
                    resultDiv.innerHTML = '<div style="padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#dc2626;font-size:13px;">❌ ' + (data.error || 'Falha ao buscar membros') + '</div>';
                    return;
                }

                var headerHtml = '<div style="padding:10px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">' +
                    '<span style="font-weight:600;font-size:13px;color:#16a34a;">✅ ' + (data.groupName || 'Grupo') + '</span>' +
                    '<span style="font-size:12px;color:#6b7280;">' + data.participantCount + ' membros</span></div>';

                var listHtml = '<div style="max-height:300px;overflow-y:auto;border:1px solid #e5e7eb;border-radius:10px;">';
                data.participants.forEach(function(p, idx) {
                    var role = p.isSuperAdmin ? '👑 Dono' : p.isAdmin ? '🛡️ Admin' : '';
                    var bg = idx % 2 === 0 ? '#ffffff' : '#f9fafb';
                    listHtml += '<div style="padding:10px 14px;background:' + bg + ';display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #f3f4f6;cursor:pointer;" onclick="navigator.clipboard.writeText(\'' + p.phone + '\').then(function(){var el=event.target.closest(\'div\');var orig=el.style.background;el.style.background=\'#d1fae5\';setTimeout(function(){el.style.background=orig;},600);})">' +
                        '<div style="display:flex;align-items:center;gap:8px;">' +
                            '<span style="font-size:15px;">👤</span>' +
                            '<span style="font-size:13px;color:#111827;">' + p.phone + '</span>' +
                        '</div>' +
                        (role ? '<span style="font-size:11px;background:#f0fdf4;border:1px solid #bbf7d0;padding:2px 8px;border-radius:10px;color:#16a34a;">' + role + '</span>' : '') +
                    '</div>';
                });
                listHtml += '</div>';
                listHtml += '<div style="font-size:11px;color:#9ca3af;margin-top:6px;text-align:center;">Clique no membro para copiar o número</div>';

                resultDiv.innerHTML = headerHtml + listHtml;
            })
            .catch(function(e) {
                loadBtn.disabled = false;
                loadBtn.innerHTML = '<span>🔍</span> Carregar Membros';
                resultDiv.innerHTML = '<div style="padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#dc2626;font-size:13px;">❌ Erro de conexão: ' + e.message + '</div>';
            });
        });
    }

    // ── Create the popup HTML ──
    function createPopup() {
        var overlay = document.createElement('div');
        overlay.id = 'bridge-commands-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;animation:bcFadeIn .2s ease;';

        var popup = document.createElement('div');
        popup.style.cssText = 'background:#fff;border-radius:16px;width:460px;max-width:92vw;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 25px 50px rgba(0,0,0,0.25);overflow:hidden;';

        popup.innerHTML = '<div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;"><h2 style="margin:0;font-size:16px;font-weight:700;color:#111827;">⚡ Comandos Rápidos</h2><button id="bc-close" style="background:none;border:none;cursor:pointer;font-size:20px;color:#9ca3af;padding:4px 8px;border-radius:6px;transition:background .15s;" onmouseover="this.style.background=\'#f3f4f6\'" onmouseout="this.style.background=\'none\'">&times;</button></div><div id="bc-tabs" style="display:flex;flex-wrap:wrap;border-bottom:1px solid #e5e7eb;background:#fafafa;"></div><div id="bc-content" style="padding:16px 20px;overflow-y:auto;flex:1;"></div>';

        overlay.appendChild(popup);
        document.body.appendChild(overlay);

        if (!document.getElementById('bc-styles')) {
            var style = document.createElement('style');
            style.id = 'bc-styles';
            style.textContent = '@keyframes bcFadeIn { from { opacity: 0; } to { opacity: 1; } } .bc-field { display:flex;flex-direction:column;gap:4px;margin-bottom:10px; } .bc-field label { font-size:12px;font-weight:600;color:#374151; } .bc-field input { border:1px solid #d1d5db;border-radius:8px;padding:8px 12px;font-size:13px;outline:none;transition:border .15s; } .bc-field input:focus { border-color:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,0.1); } .bc-cmd-card { padding:12px;border:1px solid #e5e7eb;border-radius:10px;margin-bottom:10px;transition:border .15s,box-shadow .15s;cursor:default; } .bc-cmd-card:hover { border-color:#22c55e;box-shadow:0 2px 8px rgba(34,197,94,0.08); } .bc-send-btn { background:#22c55e;color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;transition:background .15s;display:flex;align-items:center;gap:6px; } .bc-send-btn:hover { background:#16a34a; } .bc-send-btn:disabled { background:#d1d5db;cursor:not-allowed; } .bc-tab { padding:8px 10px;font-size:12px;font-weight:600;cursor:pointer;border:none;background:none;color:#6b7280;border-bottom:2px solid transparent;transition:all .15s;white-space:nowrap; } .bc-tab:hover { color:#111827;background:#f3f4f6; } .bc-tab.active { color:#22c55e;border-bottom-color:#22c55e; } .bc-quick-btn { background:#f3f4f6;border:1px solid #e5e7eb;border-radius:8px;padding:8px 14px;font-size:13px;cursor:pointer;transition:all .15s;display:flex;align-items:center;gap:8px;width:100%; } .bc-quick-btn:hover { background:#ecfdf5;border-color:#22c55e;color:#16a34a; } .bc-url-wrap { position:relative;display:flex;align-items:center; } .bc-url-wrap input { flex:1;padding-right:38px; } .bc-upload-btn { position:absolute;right:4px;top:50%;transform:translateY(-50%);background:#22c55e;color:#fff;border:none;border-radius:6px;width:28px;height:28px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;transition:background .15s; } .bc-upload-btn:hover { background:#16a34a; } .bc-upload-btn.uploading { background:#d1d5db;cursor:wait; }';
            document.head.appendChild(style);
        }

        overlay.addEventListener('click', function(e) { if (e.target === overlay) closePopup(); });
        popup.querySelector('#bc-close').addEventListener('click', closePopup);

        var tabsEl = popup.querySelector('#bc-tabs');
        CATEGORIES.forEach(function(cat, idx) {
            var tab = document.createElement('button');
            tab.className = 'bc-tab' + (idx === 0 ? ' active' : '');
            tab.textContent = cat.icon + ' ' + cat.name;
            tab.addEventListener('click', function() {
                tabsEl.querySelectorAll('.bc-tab').forEach(function(t) { t.classList.remove('active'); });
                tab.classList.add('active');
                renderCategory(idx);
            });
            tabsEl.appendChild(tab);
        });

        renderCategory(0);
    }

    function renderCategory(catIndex) {
        var container = document.getElementById('bc-content');
        if (!container) return;
        container.innerHTML = '';
        var cat = CATEGORIES[catIndex];


        cat.commands.forEach(function(cmd, cmdIdx) {
            if (catIndex === 0 && cmdIdx === 1) {
                var divider = document.createElement('div');
                divider.style.cssText = 'padding:8px 0 6px;margin-bottom:6px;border-top:1px solid #e5e7eb;margin-top:2px;';
                divider.innerHTML = '<span style="font-size:12px;font-weight:700;color:#f59e0b;">� ️ Os comandos abaixo devem ser enviados dentro do grupo correspondente</span>';
                container.appendChild(divider);
            }

            var card = document.createElement('div');
            card.className = 'bc-cmd-card';

            // Custom form: carousel
            if (cmd.customForm === 'botoes') {
                renderBotoesForm(card);
                container.appendChild(card);
                return;
            }
            if (cmd.customForm === 'carousel') {
                renderCarouselForm(card);
                container.appendChild(card);
                return;
            }

            if (cmd.customAction === 'members') {
                card.innerHTML = '<button class="bc-quick-btn" style="background:#f0f9ff;border-color:#bae6fd;"><span style="font-size:15px;">📋</span><div style="text-align:left;"><div style="font-weight:600;color:#0369a1;">Listar membros do grupo</div><div style="font-size:11px;color:#6b7280;">Exibe participantes, admins e donos</div></div></button>';
                card.querySelector('.bc-quick-btn').addEventListener('click', function() {
                    var container = document.getElementById('bc-content');
                    if (container) renderMembersTab(container);
                });
                container.appendChild(card);
                return;
            }

            if (!cmd.fields || cmd.fields.length === 0) {
                card.innerHTML = '<button class="bc-quick-btn" data-cmd="' + cmd.cmd + '"><span style="font-size:15px;">▶</span><div style="text-align:left;"><div style="font-weight:600;color:#111827;">' + cmd.desc + '</div><div style="font-size:11px;color:#6b7280;font-family:monospace;">' + cmd.cmd + '</div></div></button>';
                card.querySelector('.bc-quick-btn').addEventListener('click', function() {
                    if (sendCommand(cmd.cmd)) closePopup();
                });
            } else {
                var fieldsHtml = '<div style="margin-bottom:10px;"><span style="font-weight:700;font-size:14px;color:#111827;">' + cmd.desc + '</span><span style="font-size:11px;color:#6b7280;font-family:monospace;margin-left:8px;">' + cmd.cmd + '</span></div>';

                cmd.fields.forEach(function(f, fi) {
                    var urlField = isUrlField(f);
                    if (urlField) {
                        fieldsHtml += '<div class="bc-field"><label>' + f.name + (f.required ? ' *' : ' (opcional)') + '</label><div class="bc-url-wrap"><input type="text" placeholder="' + f.placeholder + '" data-field-idx="' + fi + '" /><button type="button" class="bc-upload-btn" data-upload-idx="' + fi + '" title="Upload imagem">📷</button><input type="file" accept="image/*" data-file-idx="' + fi + '" style="display:none;" /></div></div>';
                    } else {
                        fieldsHtml += '<div class="bc-field"><label>' + f.name + (f.required ? ' *' : ' (opcional)') + '</label><input type="text" placeholder="' + f.placeholder + '" data-field-idx="' + fi + '" /></div>';
                    }
                });

                fieldsHtml += '<div style="display:flex;gap:8px;margin-top:4px;"><button class="bc-send-btn"><span>📩</span> Enviar</button><button class="bc-copy-btn" style="background:#f3f4f6;color:#374151;border:1px solid #d1d5db;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;transition:all .15s;display:flex;align-items:center;gap:6px;"><span>📋</span> Copiar</button></div>';
                card.innerHTML = fieldsHtml;

                // Wire up upload buttons
                card.querySelectorAll('.bc-upload-btn').forEach(function(btn) {
                    var idx = btn.getAttribute('data-upload-idx');
                    var fileInput = card.querySelector('input[data-file-idx="' + idx + '"]');
                    var textInput = card.querySelector('input[data-field-idx="' + idx + '"]');
                    btn.addEventListener('click', function() { fileInput.click(); });
                    fileInput.addEventListener('change', function() {
                        var file = fileInput.files[0];
                        if (!file) return;
                        if (file.size > 5 * 1024 * 1024) { alert('Arquivo muito grande (máx 5MB)'); return; }
                        btn.classList.add('uploading');
                        btn.textContent = '⏳';
                        var fd = new FormData();
                        fd.append('file', file);
                        fetch(UPLOAD_URL, { method: 'POST', body: fd })
                            .then(function(res) { return res.json(); })
                            .then(function(data) {
                                if (data.url) {
                                    textInput.value = data.url;
                                    textInput.dispatchEvent(new Event('input', { bubbles: true }));
                                    btn.textContent = '✅';
                                    setTimeout(function() { btn.textContent = '📷'; }, 2000);
                                } else {
                                    alert('Erro no upload: ' + (data.error || 'desconhecido'));
                                    btn.textContent = '📷';
                                }
                            })
                            .catch(function(e) {
                                alert('Erro no upload: ' + e.message);
                                btn.textContent = '📷';
                            })
                            .finally(function() {
                                btn.classList.remove('uploading');
                                fileInput.value = '';
                            });
                    });
                });

                var getCardValues = function() {
                    var inputs = card.querySelectorAll('input[data-field-idx]');
                    var values = [];
                    var valid = true;
                    inputs.forEach(function(inp, i) {
                        var field = cmd.fields[i];
                        if (field.required && !inp.value.trim()) {
                            inp.style.borderColor = '#ef4444';
                            valid = false;
                        } else {
                            inp.style.borderColor = '#d1d5db';
                        }
                        values.push(inp.value.trim());
                    });
                    return { values: values, valid: valid };
                };

                card.querySelector('.bc-send-btn').addEventListener('click', function() {
                    var r = getCardValues();
                    if (!r.valid) return;
                    var fullCmd = buildCommandString(cmd, r.values);
                    console.log(LOG, 'Sending:', fullCmd);
                    if (sendCommand(fullCmd)) closePopup();
                });

                card.querySelector('.bc-copy-btn').addEventListener('click', function() {
                    var r = getCardValues();
                    if (!r.valid) return;
                    var fullCmd = buildCommandString(cmd, r.values);
                    navigator.clipboard.writeText(fullCmd).then(function() {
                        var copyBtn = card.querySelector('.bc-copy-btn');
                        copyBtn.innerHTML = '<span>✅</span> Copiado!';
                        setTimeout(function() { copyBtn.innerHTML = '<span>📋</span> Copiar'; }, 1500);
                    });
                });
            }

            container.appendChild(card);
        });
    }

    function closePopup() {
        var el = document.getElementById('bridge-commands-overlay');
        if (el) { el.style.opacity = '0'; setTimeout(function() { el.remove(); }, 200); }
        popupOpen = false;
    }

    function togglePopup() {
        if (popupOpen) {
            closePopup();
        } else {
            popupOpen = true;
            createPopup();
        }
    }

    function inject() {
        if (document.getElementById('bridge-commands-btn')) return;
        var fixed = document.getElementById('bridge-commands-btn-fixed');
        if (fixed) fixed.remove();

        var actionBar = document.querySelector('.msg-composer-actions') ||
                        document.querySelector('.flex.flex-row.gap-2.items-center.pl-2');
        if (!actionBar) return;

        var btn = document.createElement('button');
        btn.id = 'bridge-commands-btn';
        btn.title = 'Comandos Rápidos';
        btn.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;margin-left:6px;width:26px;height:26px;border-radius:5px;background:#22c55e;color:#fff;border:none;cursor:pointer;font-size:13px;transition:transform .15s,box-shadow .15s;box-shadow:0 2px 6px rgba(34,197,94,0.3);';
        btn.textContent = '⚡';
        btn.addEventListener('click', togglePopup);
        btn.addEventListener('mouseover', function() { btn.style.transform = 'scale(1.05)'; btn.style.boxShadow = '0 4px 12px rgba(34,197,94,0.4)'; });
        btn.addEventListener('mouseout', function() { btn.style.transform = 'scale(1)'; btn.style.boxShadow = '0 2px 6px rgba(34,197,94,0.3)'; });
        var bridgeContainer = actionBar.querySelector('#bridge-api-container'); if (bridgeContainer) { actionBar.insertBefore(btn, bridgeContainer); } else { actionBar.appendChild(btn); }
    }

    setInterval(function() {
        var path = window.location.pathname;
        if (path.includes('/conversations') || path.includes('/contacts/detail')) {
            inject();
        } else {
            var btn = document.getElementById('bridge-commands-btn');
            if (btn) btn.remove();
            var fixed = document.getElementById('bridge-commands-btn-fixed');
            if (fixed) fixed.remove();
        }
    }, 1500);

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && popupOpen) closePopup();
    });
})();
} catch(e) { console.error('Erro BridgeCmds:', e); }