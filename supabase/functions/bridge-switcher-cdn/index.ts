const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Credentials": "true",
};

const BRIDGE_SWITCHER_SCRIPT = `
// 🚀 BRIDGE LOADER: v6.15.0 - Real-time inbound switch sync
console.log('🚀 BRIDGE LOADER: v6.15.0 Iniciado');

try {
    (function() {
        const LOG_PREFIX = "[Bridge]";
        const CONFIG = {
            api_url: 'https://jsupvprudyxyiyxwqxuq.supabase.co/functions/v1/get-instances',
            save_url: 'https://jsupvprudyxyiyxwqxuq.supabase.co/functions/v1/bridge-switcher',
            supabase_url: 'https://jsupvprudyxyiyxwqxuq.supabase.co',
            supabase_key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpzdXB2cHJ1ZHl4eWl5eHdxeHVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5MzMwNDAsImV4cCI6MjA4NDUwOTA0MH0._Ge7hb5CHCE6mchtjGLbWXx5Q9i_D7P0dn7OlMYlvyM',
            theme: { primary: '#22c55e', border: '#d1d5db', text: '#374151' }
        };

        let state = { instances: [], lastPhoneFound: null, currentLocationId: null, currentInstanceName: null, currentConversationId: null, realtimeChannel: null };

        function extractConversationId() {
            const urlParams = new URLSearchParams(window.location.search);
            const hashParams = new URLSearchParams(window.location.hash.slice(1));
            const fromParams = urlParams.get('conversationId') || hashParams.get('conversationId');
            if (fromParams && fromParams.length >= 10) return fromParams;

            const parts = window.location.pathname.split('/').filter(Boolean);
            const idxDetail = parts.indexOf('detail');
            if (idxDetail !== -1) {
                const candidate = parts[idxDetail + 1];
                if (candidate && candidate !== 'conversations' && candidate.length >= 10) return candidate;
            }

            const idxConv = parts.lastIndexOf('conversations');
            if (idxConv !== -1) {
                const candidate = parts[idxConv + 1];
                if (candidate && candidate !== 'detail' && candidate !== 'conversations' && candidate.length >= 10) return candidate;
            }

            return null;
        }

        function cleanPhone(raw) {
            if (!raw) return null;
            const clean = raw.replace(/\\D/g, '');
            if (clean.length === 11 && !clean.startsWith('55')) return '55' + clean;
            return clean.length >= 10 ? clean : null;
        }

        function extractPhone() {
            const input = document.querySelector('input.hr-input-phone');
            if (input && input.value) return cleanPhone(input.value);
            const activeCard = document.querySelector('[data-is-active="true"][phone]');
            if (activeCard) return cleanPhone(activeCard.getAttribute('phone'));
            return null;
        }

        function showNotification(instanceName) {
            const existing = document.getElementById('bridge-notify');
            if (existing) existing.remove();
            const toast = document.createElement('div');
            toast.id = 'bridge-notify';
            toast.style.cssText = \`position: fixed; bottom: 20px; right: 20px; z-index: 10000; background: #1f2937; color: white; padding: 12px 20px; border-radius: 8px; font-size: 13px; font-weight: 600; border-left: 4px solid \${CONFIG.theme.primary}; transition: opacity 0.3s;\`;
            toast.innerHTML = \`✅ Instância <b>\${instanceName}</b> selecionada.\`;
            document.body.appendChild(toast);
            setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
        }

        function injectChatNotification(fromInstance, toInstance) {
            console.log(LOG_PREFIX, '🔄 Attempting to inject chat notification:', fromInstance, '→', toInstance);
            
            const existingOutgoingMsg = document.querySelector('[class*="outgoing"]') || 
                                        document.querySelector('[class*="sent"]') ||
                                        document.querySelector('[class*="message-out"]') ||
                                        document.querySelector('.hl-message-outgoing') ||
                                        document.querySelector('[data-message-direction="outgoing"]');
            
            if (existingOutgoingMsg) {
                console.log(LOG_PREFIX, '📋 Found existing outgoing message, cloning structure:', existingOutgoingMsg.className);
            }
            
            const selectors = [
                '.hl_conversations--messages-renderer',
                '.conversation-messages-wrapper',
                '.message-list',
                '.messages-wrapper',
                '[class*="message-list"]',
                '[class*="messages-container"]',
                '[class*="chat-messages"]',
                '.msg-list-container'
            ];
            
            let chatContainer = null;
            for (const selector of selectors) {
                chatContainer = document.querySelector(selector);
                if (chatContainer) {
                    console.log(LOG_PREFIX, '✅ Found chat container with selector:', selector);
                    console.log(LOG_PREFIX, '📦 Container children count:', chatContainer.children.length);
                    if (chatContainer.lastElementChild) {
                        console.log(LOG_PREFIX, '📦 Last child classes:', chatContainer.lastElementChild.className);
                    }
                    break;
                }
            }
            
            if (!chatContainer) {
                console.log(LOG_PREFIX, '⚠️ Chat container not found, using overlay notification');
                
                const existingOverlay = document.getElementById('bridge-switch-overlay');
                if (existingOverlay) existingOverlay.remove();
                
                const overlay = document.createElement('div');
                overlay.id = 'bridge-switch-overlay';
                overlay.style.cssText = \`
                    position: fixed;
                    top: 80px;
                    left: 50%;
                    transform: translateX(-50%);
                    z-index: 10001;
                    padding: 10px 20px;
                    background: #1f2937;
                    color: white;
                    border-radius: 8px;
                    font-size: 13px;
                    font-weight: 600;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                \`;
                
                overlay.innerHTML = \`🔄 Instância alterada: <b>\${fromInstance}</b> → <b>\${toInstance}</b>\`;
                document.body.appendChild(overlay);
                
                setTimeout(() => {
                    overlay.style.opacity = '0';
                    overlay.style.transition = 'opacity 0.3s';
                    setTimeout(() => overlay.remove(), 300);
                }, 4000);
                
                return;
            }

            document.querySelectorAll('.bridge-switch-notification').forEach(el => el.remove());

            const msgWrapper = document.createElement('div');
            msgWrapper.className = 'bridge-switch-notification hl-message hl-message-outgoing';
            msgWrapper.setAttribute('data-bridge-notification', 'true');
            msgWrapper.style.cssText = \`
                display: flex;
                flex-direction: row-reverse;
                align-items: flex-end;
                padding: 4px 16px;
                margin: 4px 0;
                width: 100%;
            \`;
            
            const bubble = document.createElement('div');
            bubble.className = 'hl-message-bubble hl-message-bubble-outgoing';
            bubble.style.cssText = \`
                background: #3b82f6;
                color: white;
                padding: 8px 12px;
                border-radius: 12px 12px 2px 12px;
                font-size: 13px;
                max-width: 70%;
                word-wrap: break-word;
                box-shadow: 0 1px 2px rgba(0,0,0,0.1);
            \`;
            bubble.innerHTML = \`🔄 Instância alterada: <b>\${fromInstance}</b> → <b>\${toInstance}</b>\`;
            
            msgWrapper.appendChild(bubble);
            chatContainer.appendChild(msgWrapper);
            msgWrapper.scrollIntoView({ behavior: 'smooth', block: 'end' });
            
            console.log(LOG_PREFIX, '✅ Chat notification injected as outgoing message');
        }

        function renderOptions(showPhone = false) {
            const select = document.getElementById('bridge-instance-selector');
            if (!select) return;
            const currentVal = select.value;
            
            select.innerHTML = state.instances.map(i => {
                const text = showPhone && i.phone ? \`\${i.name} (\${i.phone})\` : i.name;
                return \`<option value="\${i.id}" \${i.id === currentVal ? 'selected' : ''}>\${text}</option>\`;
            }).join('');
        }

        async function loadInstances(phone) {
            const locId = window.location.pathname.match(/location\\/([^\\/]+)/)?.[1];
            if (!locId || !phone) return;
            state.currentLocationId = locId;
            try {
                const res = await fetch(\`\${CONFIG.api_url}?locationId=\${locId}&phone=\${phone}\`);
                const data = await res.json();
                if (data.instances) {
                    state.instances = data.instances;
                    const activeId = data.activeInstanceId || data.instances[0]?.id;
                    const activeInstance = data.instances.find(i => i.id === activeId);
                    state.currentInstanceName = activeInstance?.name || null;
                    const select = document.getElementById('bridge-instance-selector');
                    if (select) {
                        select.value = activeId;
                        renderOptions(false);
                        select.value = activeId;
                    }
                }
            } catch (e) { console.error(LOG_PREFIX, e); }
        }

        // === SUPABASE REALTIME FOR INSTANCE SWITCH ===
        function setupRealtimeListener() {
            if (state.realtimeChannel) {
                console.log(LOG_PREFIX, '📡 Realtime channel already active');
                return;
            }
            
            try {
                // Create a simple WebSocket connection to Supabase Realtime
                const wsUrl = CONFIG.supabase_url.replace('https://', 'wss://') + '/realtime/v1/websocket?apikey=' + CONFIG.supabase_key + '&vsn=1.0.0';
                const ws = new WebSocket(wsUrl);
                
                ws.onopen = function() {
                    console.log(LOG_PREFIX, '📡 Realtime WebSocket connected');
                    
                    // Join the ghl_updates channel
                    const joinMsg = {
                        topic: 'realtime:ghl_updates',
                        event: 'phx_join',
                        payload: { config: { broadcast: { self: false } } },
                        ref: '1'
                    };
                    ws.send(JSON.stringify(joinMsg));
                };
                
                ws.onmessage = function(event) {
                    try {
                        const data = JSON.parse(event.data);
                        
                        // Handle instance_switch broadcast
                        if (data.event === 'broadcast' && data.payload?.event === 'instance_switch') {
                            const payload = data.payload?.payload;
                            if (!payload) return;
                            
                            console.log(LOG_PREFIX, '📡 Received instance_switch broadcast:', payload);
                            
                            // Check if this switch applies to current contact
                            const currentPhone = extractPhone();
                            if (!currentPhone) return;
                            
                            const currentLoc = window.location.pathname.match(/location\\/([^\\/]+)/)?.[1];
                            if (currentLoc !== payload.location_id) return;
                            
                            // Match by last 8 digits (BR phone number normalization)
                            const currentLast8 = currentPhone.slice(-8);
                            const payloadLast8 = (payload.lead_phone || '').slice(-8);
                            
                            if (currentLast8 !== payloadLast8) {
                                console.log(LOG_PREFIX, '📡 Phone mismatch, ignoring switch', { current: currentLast8, payload: payloadLast8 });
                                return;
                            }
                            
                            console.log(LOG_PREFIX, '📡 Instance switch applies to current contact!');
                            
                            // Update dropdown
                            const select = document.getElementById('bridge-instance-selector');
                            if (select && payload.new_instance_id) {
                                select.value = payload.new_instance_id;
                                state.currentInstanceName = payload.new_instance_name;
                                renderOptions(false);
                                console.log(LOG_PREFIX, '📡 Dropdown updated to:', payload.new_instance_name);
                            }
                            
                            // Show notification
                            if (payload.previous_instance_name && payload.new_instance_name) {
                                injectChatNotification(payload.previous_instance_name, payload.new_instance_name);
                                showNotification(payload.new_instance_name);
                            }
                        }
                    } catch (e) {
                        // Ignore parse errors for heartbeat messages
                    }
                };
                
                ws.onerror = function(error) {
                    console.error(LOG_PREFIX, '📡 Realtime WebSocket error:', error);
                };
                
                ws.onclose = function() {
                    console.log(LOG_PREFIX, '📡 Realtime WebSocket closed, will reconnect on next inject');
                    state.realtimeChannel = null;
                };
                
                // Send heartbeat every 30s to keep connection alive
                setInterval(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: Date.now().toString() }));
                    }
                }, 30000);
                
                state.realtimeChannel = ws;
            } catch (e) {
                console.error(LOG_PREFIX, '📡 Failed to setup realtime:', e);
            }
        }

        function inject() {
            if (document.getElementById('bridge-api-container')) return;
            const actionBar = document.querySelector('.msg-composer-actions') || 
                              document.querySelector('.flex.flex-row.gap-2.items-center.pl-2');
            if (!actionBar) return;

            const container = document.createElement('div');
            container.id = 'bridge-api-container';
            container.style.cssText = \`display: inline-flex; align-items: center; margin-left: 8px; padding: 2px 10px; height: 30px; background: #ffffff; border: 1px solid \${CONFIG.theme.border}; border-radius: 20px;\`;
            
            const styleTag = document.createElement('style');
            styleTag.textContent = \`
                #bridge-instance-selector {
                    border: none !important;
                    background: transparent !important;
                    font-size: 12px;
                    font-weight: 700;
                    color: \${CONFIG.theme.text};
                    cursor: pointer;
                    outline: none !important;
                    box-shadow: none !important;
                    appearance: none;
                    -webkit-appearance: none;
                    max-width: 150px;
                }
                #bridge-instance-selector:focus, #bridge-instance-selector:active {
                    outline: none !important;
                    box-shadow: none !important;
                    border: none !important;
                }
            \`;
            document.head.appendChild(styleTag);

            container.innerHTML = \`
                <div style="display: flex; align-items: center; gap: 6px;">
                    <div style="width: 8px; height: 8px; background: \${CONFIG.theme.primary}; border-radius: 50%;"></div>
                    <select id="bridge-instance-selector">
                        <option>...</option>
                    </select>
                </div>\`;
            
            actionBar.appendChild(container);
            const select = container.querySelector('select');

            select.addEventListener('mousedown', () => renderOptions(true));
            select.addEventListener('blur', () => renderOptions(false));
            
            select.addEventListener('change', async (e) => {
                const phone = extractPhone();
                const conversationId = extractConversationId();
                const previousName = state.currentInstanceName;
                const newInstance = state.instances.find(i => i.id === e.target.value);
                const newName = newInstance?.name || "";
                
                console.log(LOG_PREFIX, '🔄 Instance change detected:', { previousName, newName, instanceId: e.target.value, conversationId });
                
                renderOptions(false);
                
                try {
                    await fetch(CONFIG.save_url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            instanceId: e.target.value, 
                            locationId: state.currentLocationId, 
                            phone: phone,
                            conversationId: conversationId,
                            previousInstanceName: previousName,
                            newInstanceName: newName
                        })
                    });
                    
                    if (previousName && previousName !== newName) {
                        console.log(LOG_PREFIX, '📢 Calling injectChatNotification:', previousName, '→', newName);
                        injectChatNotification(previousName, newName);
                    } else {
                        console.log(LOG_PREFIX, '⚠️ Skipping notification - previousName:', previousName, 'newName:', newName);
                    }
                    
                    state.currentInstanceName = newName;
                    
                    showNotification(newName);
                } catch (err) { console.error("Erro Save:", err); }
            });

            const p = extractPhone();
            if (p) loadInstances(p);
            
            // Setup realtime listener for inbound instance switches
            setupRealtimeListener();
        }

        setInterval(() => {
            const path = window.location.pathname;
            if (path.includes('/conversations') || path.includes('/contacts/detail')) {
                state.currentConversationId = extractConversationId();

                inject();
                const p = extractPhone();
                if (p && p !== state.lastPhoneFound) {
                    state.lastPhoneFound = p;
                    loadInstances(p);
                }
            }
        }, 1500);
    })();
} catch (e) { console.error('Erro Bridge:', e); }
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  return new Response(BRIDGE_SWITCHER_SCRIPT, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
});
