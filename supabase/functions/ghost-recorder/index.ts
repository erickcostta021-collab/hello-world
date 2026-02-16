const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const GHOST_RECORDER_SCRIPT = `(function() {
    console.log("\\ud83d\\ude80 Ghost Recorder: Iniciando Stevo Engine V6...");

    var mediaRecorder = null, currentStream = null, audioChunks = [], audioBlob = null;
    var isRecording = false, timerInterval, startTime;
    var sendState = "idle"; // idle | sending | sent

    var BRIDGE_API = "https://jsupvprudyxyiyxwqxuq.supabase.co/functions/v1";

    var ICONS = {
        mic: '<svg viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 text-gray-500"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>',
        stop: '<svg viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 text-red-500 animate-pulse"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/></svg>',
        trash: '<svg viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 text-gray-400"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
        send: '<svg viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
        play: '<svg viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5"><path d="M8 5v14l11-7z"/></svg>',
        pause: '<svg viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>',
        check: '<svg viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>'
    };

    var SPINNER_CSS = "ghost-spinner";
    var styleEl = document.createElement("style");
    styleEl.textContent = "@keyframes ghost-spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}" +
        "." + SPINNER_CSS + "{display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:ghost-spin .6s linear infinite;vertical-align:middle;margin-right:4px;}" +
        ".ghost-btn-transition{transition:all .25s ease;}" +
        ".ghost-player-bar{display:flex;align-items:center;gap:6px;padding:2px 0;}" +
        ".ghost-play-btn{cursor:pointer;min-width:28px;min-height:28px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:#e5e7eb;transition:background .2s;}" +
        ".ghost-play-btn:hover{background:#d1d5db;}" +
        ".ghost-progress-wrap{flex:1;height:4px;background:#e5e7eb;border-radius:2px;cursor:pointer;min-width:40px;position:relative;}" +
        ".ghost-progress-fill{height:100%;background:#22c55e;border-radius:2px;transition:width .1s linear;width:0%;}" +
        ".ghost-duration{font-size:11px;color:#6b7280;min-width:32px;text-align:center;white-space:nowrap;}";
    document.head.appendChild(styleEl);

    function cleanPhone(raw) {
        if (!raw) return null;
        var clean = raw.replace(/\\D/g, '');
        return clean.length >= 8 ? clean : null;
    }

    function extractPhone() {
        var input = document.querySelector('input.hr-input-phone');
        if (input && input.value) return cleanPhone(input.value);
        var activeCard = document.querySelector('[data-is-active="true"][phone]');
        if (activeCard) return cleanPhone(activeCard.getAttribute('phone'));
        return null;
    }

    function extractContextData() {
        var url = window.location.pathname;
        var locMatch = url.match(/\\/location\\/([^\\/]+)/);
        var convMatch = url.match(/\\/conversations\\/[^\\/]+\\/([^\\/]+)/);
        var locationId = locMatch ? locMatch[1] : null;
        var conversationId = convMatch ? convMatch[1] : null;
        var phone = extractPhone();
        return { locationId: locationId, conversationId: conversationId, phone: phone };
    }

    function blobToBase64(blob) {
        return new Promise(function(resolve) {
            var reader = new FileReader();
            reader.onloadend = function() { resolve(reader.result.split(',')[1]); };
            reader.readAsDataURL(blob);
        });
    }

    function formatTime(sec) {
        var m = Math.floor(sec / 60);
        var s = Math.floor(sec % 60);
        return m.toString().padStart(2,'0') + ':' + s.toString().padStart(2,'0');
    }

    function sendToServer(ab) {
        return blobToBase64(ab).then(function(base64Audio) {
            var ctx = extractContextData();
            console.log("\\ud83d\\udce1 Contexto extraido:", JSON.stringify(ctx));

            if (!ctx.locationId) {
                alert("Erro: N\\u00e3o foi poss\\u00edvel detectar o locationId da URL.");
                return false;
            }
            if (!ctx.phone) {
                alert("Erro: N\\u00e3o foi poss\\u00edvel detectar o telefone do lead.");
                return false;
            }

            var payload = {
                audio: base64Audio,
                format: ab.type,
                phone: ctx.phone,
                locationId: ctx.locationId,
                timestamp: new Date().toISOString()
            };
            if (ctx.conversationId) payload.conversationId = ctx.conversationId;

            return fetch(BRIDGE_API + "/ghost-audio", {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(function(response) {
                return response.json().then(function(data) {
                    if (response.ok && data.success) {
                        console.log("\\u2705 \\u00c1udio enviado com sucesso via " + (data.path || 'UAZAPI'));
                        return true;
                    } else {
                        console.error("\\u274c Erro do servidor:", data);
                        alert("Erro ao enviar \\u00e1udio: " + (data.error || response.status));
                        return false;
                    }
                });
            });
        }).catch(function(error) {
            console.error("\\u274c Erro ao enviar:", error);
            alert("Erro ao enviar \\u00e1udio. Tente novamente.");
            return false;
        });
    }

    // ── Audio Preview Player ──
    var previewAudio = null;
    var isPlaying = false;
    var progressRAF = null;

    function destroyPreview() {
        if (previewAudio) {
            previewAudio.pause();
            previewAudio.src = '';
            previewAudio = null;
        }
        isPlaying = false;
        if (progressRAF) { cancelAnimationFrame(progressRAF); progressRAF = null; }
    }

    function initPreview(blob) {
        destroyPreview();
        previewAudio = new Audio(URL.createObjectURL(blob));
        previewAudio.addEventListener('ended', function() {
            isPlaying = false;
            updatePlayerUI();
        });
    }

    function togglePlayPause() {
        if (!previewAudio) return;
        if (isPlaying) {
            previewAudio.pause();
            isPlaying = false;
        } else {
            previewAudio.play();
            isPlaying = true;
            tickProgress();
        }
        updatePlayerUI();
    }

    function tickProgress() {
        if (!isPlaying || !previewAudio) return;
        var fill = document.getElementById('ghost-progress-fill');
        var dur = document.getElementById('ghost-dur');
        if (fill && previewAudio.duration) {
            fill.style.width = ((previewAudio.currentTime / previewAudio.duration) * 100) + '%';
        }
        if (dur) dur.textContent = formatTime(previewAudio.currentTime);
        progressRAF = requestAnimationFrame(tickProgress);
    }

    function updatePlayerUI() {
        var btn = document.getElementById('ghost-play-btn');
        if (btn) btn.innerHTML = isPlaying ? ICONS.pause : ICONS.play;
        if (!isPlaying && progressRAF) { cancelAnimationFrame(progressRAF); progressRAF = null; }
    }

    var isSeeking = false;

    function seekFromEvent(e) {
        if (!previewAudio || !previewAudio.duration) return;
        var bar = document.getElementById('ghost-progress-wrap');
        if (!bar) return;
        var clientX = e.touches ? e.touches[0].clientX : e.clientX;
        var rect = bar.getBoundingClientRect();
        var ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        previewAudio.currentTime = ratio * previewAudio.duration;
        var fill = document.getElementById('ghost-progress-fill');
        if (fill) fill.style.width = (ratio * 100) + '%';
        var dur = document.getElementById('ghost-dur');
        if (dur) dur.textContent = formatTime(previewAudio.currentTime);
    }

    function onSeekStart(e) {
        isSeeking = true;
        seekFromEvent(e);
        document.addEventListener('mousemove', onSeekMove);
        document.addEventListener('mouseup', onSeekEnd);
        document.addEventListener('touchmove', onSeekMove);
        document.addEventListener('touchend', onSeekEnd);
    }
    function onSeekMove(e) { if (isSeeking) seekFromEvent(e); }
    function onSeekEnd() {
        isSeeking = false;
        document.removeEventListener('mousemove', onSeekMove);
        document.removeEventListener('mouseup', onSeekEnd);
        document.removeEventListener('touchmove', onSeekMove);
        document.removeEventListener('touchend', onSeekEnd);
    }

    // ── Send Button States ──
    function setSendState(state) {
        sendState = state;
        var btn = document.getElementById('ghost-send-btn');
        if (!btn) return;
        btn.classList.add('ghost-btn-transition');

        if (state === 'idle') {
            btn.innerHTML = ICONS.send + ' <span style="font-size:12px;margin-left:2px;">Enviar</span>';
            btn.style.background = '#22c55e';
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'auto';
        } else if (state === 'sending') {
            btn.innerHTML = '<span class="' + SPINNER_CSS + '"></span><span style="font-size:12px;">Enviando...</span>';
            btn.style.background = '#6b7280';
            btn.style.opacity = '0.85';
            btn.style.pointerEvents = 'none';
        } else if (state === 'sent') {
            btn.innerHTML = ICONS.check + ' <span style="font-size:12px;margin-left:2px;">Enviado!</span>';
            btn.style.background = '#16a34a';
            btn.style.opacity = '1';
            btn.style.pointerEvents = 'none';
        }
    }

    // ── UI Creation ──
    function createUI() {
        var attachPath = 'M17.5 5.256V16.5a5.5 5.5 0 11-11 0V5.667a3.667 3.667 0 017.333 0v10.779a1.833 1.833 0 11-3.666 0V6.65';
        var attachIcon = document.querySelector('path[d="' + attachPath + '"]');
        var toolbar = (attachIcon ? attachIcon.closest('.flex') : null) || document.querySelector('.message-input-actions');

        if (toolbar && !document.getElementById('ghost-recorder-ui')) {
            var container = document.createElement('div');
            container.id = 'ghost-recorder-ui';
            container.style.cssText = "display: flex; align-items: center; margin-right: 8px; z-index: 100;";

            var mainBtn = document.createElement('div');
            mainBtn.id = "ghost-main-btn";
            mainBtn.innerHTML = ICONS.mic;
            mainBtn.style.cursor = "pointer";
            mainBtn.onclick = handleMainClick;

            var timerDisp = document.createElement('span');
            timerDisp.id = "ghost-timer";
            timerDisp.style.cssText = "display: none; font-size: 12px; font-weight: bold; color: #ef4444; margin: 0 5px;";
            timerDisp.innerText = "00:00";

            var group = document.createElement('div');
            group.id = "ghost-action-group";
            group.style.cssText = "display: none; align-items: center; gap: 6px; background: #f3f4f6; padding: 4px 10px; border-radius: 20px;";

            // Trash
            var bTrash = document.createElement('div');
            bTrash.innerHTML = ICONS.trash;
            bTrash.onclick = fullReset;
            bTrash.style.cssText = 'cursor:pointer;min-width:28px;min-height:28px;display:flex;align-items:center;justify-content:center;';

            // Player bar (between trash and send)
            var playerBar = document.createElement('div');
            playerBar.id = 'ghost-player-bar';
            playerBar.className = 'ghost-player-bar';

            var playBtn = document.createElement('div');
            playBtn.id = 'ghost-play-btn';
            playBtn.className = 'ghost-play-btn';
            playBtn.innerHTML = ICONS.play;
            playBtn.onclick = togglePlayPause;

            var progressWrap = document.createElement('div');
            progressWrap.id = 'ghost-progress-wrap';
            progressWrap.className = 'ghost-progress-wrap';
            progressWrap.onmousedown = onSeekStart;
            progressWrap.ontouchstart = onSeekStart;

            var progressFill = document.createElement('div');
            progressFill.id = 'ghost-progress-fill';
            progressFill.className = 'ghost-progress-fill';
            progressWrap.appendChild(progressFill);

            var durLabel = document.createElement('span');
            durLabel.id = 'ghost-dur';
            durLabel.className = 'ghost-duration';
            durLabel.textContent = '00:00';

            playerBar.appendChild(playBtn);
            playerBar.appendChild(progressWrap);
            playerBar.appendChild(durLabel);

            // Send button
            var bSend = document.createElement('div');
            bSend.id = 'ghost-send-btn';
            bSend.style.cssText = 'cursor:pointer;display:flex;align-items:center;gap:2px;padding:4px 10px;border-radius:14px;background:#22c55e;color:#fff;min-height:28px;';
            bSend.innerHTML = ICONS.send + ' <span style="font-size:12px;margin-left:2px;">Enviar</span>';
            bSend.onclick = handleSend;

            group.appendChild(bTrash);
            group.appendChild(playerBar);
            group.appendChild(bSend);
            container.appendChild(timerDisp);
            container.appendChild(mainBtn);
            container.appendChild(group);
            toolbar.prepend(container);
            console.log("\\u2705 Interface Ghost Recorder V6 criada");
        }
    }

    function handleMainClick() {
        var mb = document.getElementById('ghost-main-btn');
        var td = document.getElementById('ghost-timer');
        if (!isRecording) {
            navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
                currentStream = stream;
                var mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' :
                               MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
                mediaRecorder = new MediaRecorder(stream, { mimeType: mimeType });
                audioChunks = [];
                mediaRecorder.ondataavailable = function(e) { audioChunks.push(e.data); };
                mediaRecorder.onstop = function() {
                    audioBlob = new Blob(audioChunks, { type: mimeType });
                    mb.style.display = 'none'; td.style.display = 'none';
                    document.getElementById('ghost-action-group').style.display = 'flex';
                    initPreview(audioBlob);
                    // Show total duration once metadata loads
                    previewAudio.addEventListener('loadedmetadata', function() {
                        var dur = document.getElementById('ghost-dur');
                        if (dur) dur.textContent = formatTime(previewAudio.duration);
                    });
                    console.log("\\ud83c\\udf99\\ufe0f Grava\\u00e7\\u00e3o: " + (audioBlob.size / 1024).toFixed(2) + "KB");
                };
                mediaRecorder.start();
                isRecording = true;
                mb.innerHTML = ICONS.stop; td.style.display = 'block';
                startTime = Date.now();
                timerInterval = setInterval(function() {
                    var elapsed = Math.floor((Date.now() - startTime) / 1000);
                    td.innerText = Math.floor(elapsed / 60).toString().padStart(2, '0') + ':' + (elapsed % 60).toString().padStart(2, '0');
                }, 1000);
                console.log("\\ud83d\\udd34 Gravando...");
            }).catch(function() { alert("Erro ao acessar microfone."); });
        } else {
            mediaRecorder.stop(); isRecording = false; clearInterval(timerInterval);
            currentStream.getTracks().forEach(function(t) { t.stop(); });
        }
    }

    function handleSend() {
        if (!audioBlob || sendState !== 'idle') return;
        setSendState('sending');

        sendToServer(audioBlob).then(function(success) {
            if (success) {
                setSendState('sent');
                setTimeout(function() { fullReset(); }, 2000);
            } else {
                setSendState('idle');
            }
        });
    }

    function fullReset() {
        destroyPreview();
        setSendState('idle');
        var g = document.getElementById('ghost-action-group'); if (g) { g.style.display = 'none'; g.style.opacity = '1'; g.style.pointerEvents = 'auto'; }
        var m = document.getElementById('ghost-main-btn'); if (m) { m.style.display = 'block'; m.innerHTML = ICONS.mic; }
        var t = document.getElementById('ghost-timer'); if (t) t.style.display = 'none';
        var fill = document.getElementById('ghost-progress-fill'); if (fill) fill.style.width = '0%';
        var dur = document.getElementById('ghost-dur'); if (dur) dur.textContent = '00:00';
        audioChunks = []; audioBlob = null; isRecording = false;
    }

    var observer = new MutationObserver(function() { if (!document.getElementById('ghost-recorder-ui')) createUI(); });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(createUI, 2000);
    setTimeout(createUI, 5000);

    console.log("\\u2705 Ghost Recorder V6 carregado");
})();`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  return new Response(GHOST_RECORDER_SCRIPT, {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
});
