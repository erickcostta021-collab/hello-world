
UPDATE public.cdn_scripts 
SET content = $BCSCRIPT$
// 🎯 BRIDGE COMMANDS: v1.1.0 - Interactive command popup for GHL chat
console.log('🎯 BRIDGE COMMANDS: v1.1.0 Iniciado');

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
                { cmd: "#botoes", desc: "Enviar botões de resposta rápida", fields: [
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
                }},
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
        }
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
    function renderCarouselForm(container) {
        container.innerHTML = '';
        var state = { text: '', cards: [{ title: '', image: '', body: '', buttons: [''] }] };

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
                    state.cards[ci].buttons[bi] = btnInputs[b].value;
                }
            }
        }

        function addCard() {
            if (state.cards.length >= 10) return;
            saveCardState();
            state.cards.push({ title: '', image: '', body: '', buttons: [''] });
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
            state.cards[cardIdx].buttons.push('');
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
                bodyDiv.innerHTML = '<label>corpo *</label><input type="text" placeholder="Texto do card" data-cr-body />';
                bodyDiv.querySelector('input').value = card.body;
                cardEl.appendChild(bodyDiv);

                // Buttons
                for (var bi = 0; bi < card.buttons.length; bi++) {
                    var btnDiv = document.createElement('div');
                    btnDiv.className = 'bc-field';
                    btnDiv.style.cssText = 'flex-direction:row;align-items:center;gap:6px;';
                    var label = document.createElement('label');
                    label.style.minWidth = '60px';
                    label.textContent = 'botão ' + (bi + 1) + (bi === 0 ? ' *' : '');
                    var inp = document.createElement('input');
                    inp.type = 'text';
                    inp.placeholder = 'Texto do botão';
                    inp.setAttribute('data-btn-idx', bi);
                    inp.value = card.buttons[bi];
                    inp.style.flex = '1';
                    btnDiv.appendChild(label);
                    btnDiv.appendChild(inp);
                    if (bi > 0) {
                        var rmBtn = document.createElement('button');
                        rmBtn.textContent = '✕';
                        rmBtn.style.cssText = 'background:#fee2e2;color:#dc2626;border:none;border-radius:4px;width:22px;height:22px;cursor:pointer;font-size:11px;flex-shrink:0;';
                        rmBtn.setAttribute('data-remove-btn', ci + '-' + bi);
                        btnDiv.appendChild(rmBtn);
                    }
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
                if (!c.body) { var b = cardEl.querySelector('[data-cr-body]'); if (b) b.style.borderColor = '#ef4444'; valid = false; }
                if (!c.buttons[0]) { var btn0 = cardEl.querySelector('[data-btn-idx="0"]'); if (btn0) btn0.style.borderColor = '#ef4444'; valid = false; }
                var btns = c.buttons.filter(function(b) { return b && b.trim(); });
                cardParts.push('[' + c.title + '],' + c.image + ',' + c.body + ',' + btns.join(','));
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

    // ── Create the popup HTML ──
    function createPopup() {
        var overlay = document.createElement('div');
        overlay.id = 'bridge-commands-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;animation:bcFadeIn .2s ease;';

        var popup = document.createElement('div');
        popup.style.cssText = 'background:#fff;border-radius:16px;width:460px;max-width:92vw;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 25px 50px rgba(0,0,0,0.25);overflow:hidden;';

        popup.innerHTML = '<div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between;"><h2 style="margin:0;font-size:16px;font-weight:700;color:#111827;">⚡ Comandos Rápidos</h2><button id="bc-close" style="background:none;border:none;cursor:pointer;font-size:20px;color:#9ca3af;padding:4px 8px;border-radius:6px;transition:background .15s;" onmouseover="this.style.background=\'#f3f4f6\'" onmouseout="this.style.background=\'none\'">&times;</button></div><div id="bc-tabs" style="display:flex;border-bottom:1px solid #e5e7eb;background:#fafafa;"></div><div id="bc-content" style="padding:16px 20px;overflow-y:auto;flex:1;"></div>';

        overlay.appendChild(popup);
        document.body.appendChild(overlay);

        if (!document.getElementById('bc-styles')) {
            var style = document.createElement('style');
            style.id = 'bc-styles';
            style.textContent = '@keyframes bcFadeIn { from { opacity: 0; } to { opacity: 1; } } .bc-field { display:flex;flex-direction:column;gap:4px;margin-bottom:10px; } .bc-field label { font-size:12px;font-weight:600;color:#374151; } .bc-field input { border:1px solid #d1d5db;border-radius:8px;padding:8px 12px;font-size:13px;outline:none;transition:border .15s; } .bc-field input:focus { border-color:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,0.1); } .bc-cmd-card { padding:12px;border:1px solid #e5e7eb;border-radius:10px;margin-bottom:10px;transition:border .15s,box-shadow .15s;cursor:default; } .bc-cmd-card:hover { border-color:#22c55e;box-shadow:0 2px 8px rgba(34,197,94,0.08); } .bc-send-btn { background:#22c55e;color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;transition:background .15s;display:flex;align-items:center;gap:6px; } .bc-send-btn:hover { background:#16a34a; } .bc-send-btn:disabled { background:#d1d5db;cursor:not-allowed; } .bc-tab { padding:10px 16px;font-size:13px;font-weight:600;cursor:pointer;border:none;background:none;color:#6b7280;border-bottom:2px solid transparent;transition:all .15s;white-space:nowrap; } .bc-tab:hover { color:#111827;background:#f3f4f6; } .bc-tab.active { color:#22c55e;border-bottom-color:#22c55e; } .bc-quick-btn { background:#f3f4f6;border:1px solid #e5e7eb;border-radius:8px;padding:8px 14px;font-size:13px;cursor:pointer;transition:all .15s;display:flex;align-items:center;gap:8px;width:100%; } .bc-quick-btn:hover { background:#ecfdf5;border-color:#22c55e;color:#16a34a; } .bc-url-wrap { position:relative;display:flex;align-items:center; } .bc-url-wrap input { flex:1;padding-right:38px; } .bc-upload-btn { position:absolute;right:4px;top:50%;transform:translateY(-50%);background:#22c55e;color:#fff;border:none;border-radius:6px;width:28px;height:28px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;transition:background .15s; } .bc-upload-btn:hover { background:#16a34a; } .bc-upload-btn.uploading { background:#d1d5db;cursor:wait; }';
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
                divider.innerHTML = '<span style="font-size:12px;font-weight:700;color:#f59e0b;">⚠️ Os comandos abaixo devem ser enviados dentro do grupo correspondente</span>';
                container.appendChild(divider);
            }

            var card = document.createElement('div');
            card.className = 'bc-cmd-card';

            // Custom form: carousel
            if (cmd.customForm === 'carousel') {
                renderCarouselForm(card);
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
        actionBar.appendChild(btn);
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
$BCSCRIPT$,
    version = 'v1.1.0',
    updated_at = now()
WHERE slug = 'bridge-button-v1.js' AND is_active = true;
