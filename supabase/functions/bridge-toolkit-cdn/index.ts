const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const BRIDGE_TOOLKIT_SCRIPT = `
(function() {
    console.log("🚀 Bridge Toolkit v23: Iniciando (Edit Button Fix)...");

    const BRIDGE_CONFIG = {
        supabase_url: 'https://jsupvprudyxyiyxwqxuq.supabase.co',
        supabase_anon_key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpzdXB2cHJ1ZHl4eWl5eHdxeHVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg5MzMwNDAsImV4cCI6MjA4NDUwOTA0MH0._Ge7hb5CHCE6mchtjGLbWXx5Q9i_D7P0dn7OlMYlvyM',
        endpoint: '/functions/v1/map-messages'
    };

    let replyContext = null; // Stores message being replied to
    let editContext = null;  // Stores message being edited
    let realtimeChannel = null; // Supabase Realtime channel
    let cachedGhlUserId = null; // Cached GHL user ID
    
    // Track rendered states to avoid re-rendering
    const renderedStates = new Map(); // ghlId -> { deleted, edited, replied }
    
    // ========== GHL USER DETECTION ==========
    
    // Try to extract GHL user ID from various sources
    const getGhlUserId = () => {
        if (cachedGhlUserId) return cachedGhlUserId;
        
        try {
            // Method 1: Check window.__user or similar global
            if (window.__user?.id) {
                cachedGhlUserId = window.__user.id;
                console.log("👤 Bridge: Found GHL user via window.__user:", cachedGhlUserId);
                return cachedGhlUserId;
            }
            
            // Method 2: Check localStorage for user data
            const userStr = localStorage.getItem('user') || localStorage.getItem('ghl_user');
            if (userStr) {
                try {
                    const user = JSON.parse(userStr);
                    if (user?.id || user?.userId) {
                        cachedGhlUserId = user.id || user.userId;
                        console.log("👤 Bridge: Found GHL user via localStorage:", cachedGhlUserId);
                        return cachedGhlUserId;
                    }
                } catch (e) {}
            }
            
            // Method 3: Check for HL_* prefixed localStorage keys (common in GHL)
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key?.startsWith('HL_') || key?.includes('user')) {
                    try {
                        const val = localStorage.getItem(key);
                        if (val?.startsWith('{')) {
                            const parsed = JSON.parse(val);
                            if (parsed?.userId || parsed?.id) {
                                cachedGhlUserId = parsed.userId || parsed.id;
                                console.log("👤 Bridge: Found GHL user via", key, ":", cachedGhlUserId);
                                return cachedGhlUserId;
                            }
                        }
                    } catch (e) {}
                }
            }
            
            // Method 4: Check window.HL or similar
            if (window.HL?.user?.id) {
                cachedGhlUserId = window.HL.user.id;
                console.log("👤 Bridge: Found GHL user via window.HL:", cachedGhlUserId);
                return cachedGhlUserId;
            }
            
            console.log("👤 Bridge: Could not detect GHL user ID");
        } catch (e) {
            console.warn("👤 Bridge: Error detecting GHL user:", e);
        }
        
        return null;
    };
    
    // ========== PERFORMANCE: Caches and Observers ==========
    
    // Position cache to avoid repeated getBoundingClientRect calls
    const positionCache = new WeakMap(); // msgElement -> { isOutbound: boolean, timestamp: number }
    const POSITION_CACHE_TTL = 5000; // 5 seconds TTL
    
    // Visible messages set (updated by Intersection Observer)
    const visibleMessages = new Set();
    let messageObserver = null;
    
    // Debounce helper
    const debounce = (fn, delay) => {
        let timeoutId = null;
        return (...args) => {
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(() => fn(...args), delay);
        };
    };
    
    // Get cached isOutbound value or calculate it
    const getIsOutbound = (msgEl) => {
        if (!msgEl) return false;
        
        const now = Date.now();
        const cached = positionCache.get(msgEl);
        
        // Return cached value if still valid
        if (cached && (now - cached.timestamp) < POSITION_CACHE_TTL) {
            return cached.isOutbound;
        }
        
        // Calculate isOutbound
        let isOutbound = false;
        try {
            // Find the scrollable chat container (parent with overflow)
            let chatContainer = msgEl.parentElement;
            for (let i = 0; i < 15 && chatContainer; i++) {
                const style = window.getComputedStyle(chatContainer);
                if (style.overflowY === 'auto' || style.overflowY === 'scroll') break;
                chatContainer = chatContainer.parentElement;
            }
            
            if (chatContainer) {
                const containerRect = chatContainer.getBoundingClientRect();
                const msgRect = msgEl.getBoundingClientRect();
                // Message center relative to chat container
                const msgCenter = msgRect.left + msgRect.width / 2;
                const containerCenter = containerRect.left + containerRect.width / 2;
                isOutbound = msgCenter > containerCenter;
            }
        } catch (e) {
            isOutbound = false;
        }
        
        // Cache the result
        positionCache.set(msgEl, { isOutbound, timestamp: now });
        
        return isOutbound;
    };
    
    // Initialize Intersection Observer for visible messages
    const initMessageObserver = () => {
        if (messageObserver) return;
        
        messageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const ghlId = entry.target.getAttribute('data-message-id');
                if (!ghlId) return;
                
                if (entry.isIntersecting) {
                    visibleMessages.add(ghlId);
                } else {
                    visibleMessages.delete(ghlId);
                }
            });
        }, {
            root: null, // viewport
            rootMargin: '100px', // Pre-load 100px outside viewport
            threshold: 0
        });
        
        console.log("👁️ Bridge: Intersection Observer initialized");
    };
    
    // Observe a message element
    const observeMessage = (msgEl) => {
        if (!messageObserver || !msgEl) return;
        messageObserver.observe(msgEl);
    };

    const showToast = (msg, isError = false) => {
        const toast = document.createElement('div');
        toast.innerText = msg;
        toast.style.cssText = \`
            position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
            background: \${isError ? '#ef4444' : '#333'}; color: #fff; padding: 10px 20px; border-radius: 8px;
            z-index: 999999; font-size: 14px; font-family: sans-serif;
        \`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2500);
    };

    const sendAction = async (action, ghlId, extra = {}) => {
        console.log(\`📡 Bridge Toolkit - Ação: \${action} | GHL ID: \${ghlId}\`, extra);
        try {
            const url = BRIDGE_CONFIG.supabase_url + BRIDGE_CONFIG.endpoint;
            console.log("📤 Enviando para:", url);
            
            const response = await fetch(url, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'apikey': BRIDGE_CONFIG.supabase_anon_key,
                    'Authorization': \`Bearer \${BRIDGE_CONFIG.supabase_anon_key}\`,
                },
                body: JSON.stringify({ action, ghl_id: ghlId, ...extra })
            });
            
            console.log("📥 Response status:", response.status);
            const data = await response.json();
            console.log("📥 Response data:", data);
            
            if (data.success) {
                console.log("✅ Ação executada com sucesso:", action);
                return data;
            } else {
                console.error("❌ Erro na ação:", data.error);
                if (data.error === "Message not found") {
                    showToast("Mensagem não mapeada. Envie uma nova mensagem primeiro.", true);
                } else if (data.error && data.error.includes("15 minutes")) {
                    showToast("Não é possível editar mensagens com mais de 15 minutos.", true);
                } else {
                    showToast("Erro: " + (data.error || "Falha na operação"), true);
                }
                return null;
            }
        } catch (e) {
            console.error("❌ Erro de conexão:", e);
            showToast("Erro de conexão: " + e.message, true);
            return null;
        }
    };

    // Show reply banner in input area
    const showReplyBanner = async (msgText, ghlId, locationId) => {
        clearEditContext(); // Clear edit if switching to reply
        const existingBanner = document.getElementById('bridge-reply-banner');
        if (existingBanner) existingBanner.remove();
        
        // Try to open chat if closed
        const needsWait = ensureChatOpen();
        if (needsWait) {
            await new Promise(resolve => setTimeout(resolve, 150));
        }
        
        let inputArea = findMessageInput();
        
        // Retry finding input after potential open
        if (!inputArea || inputArea.offsetParent === null) {
            await new Promise(resolve => setTimeout(resolve, 300));
            inputArea = findMessageInput();
        }
        
        if (!inputArea || inputArea.offsetParent === null) {
            showToast("Abra o chat para responder a mensagem", true);
            return;
        }
        
        const banner = document.createElement('div');
        banner.id = 'bridge-reply-banner';
        banner.style.cssText = \`
            background: #f0f9ff; border-left: 4px solid #0ea5e9; padding: 8px 12px;
            margin-bottom: 8px; border-radius: 4px; display: flex; justify-content: space-between;
            align-items: center; font-family: sans-serif; font-size: 13px;
        \`;
        banner.innerHTML = \`
            <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:80%;">
                <span style="color:#0ea5e9; font-weight:600;">↩️ Respondendo:</span>
                <span style="color:#666; margin-left:8px;">\${msgText.substring(0, 50)}\${msgText.length > 50 ? '...' : ''}</span>
            </div>
            <span id="cancel-reply" style="cursor:pointer; color:#999; font-size:18px;">✕</span>
        \`;
        
        inputArea.parentElement.insertBefore(banner, inputArea);
        
        document.getElementById('cancel-reply').onclick = () => {
            banner.remove();
            replyContext = null;
        };
        
        replyContext = { ghlId, text: msgText, locationId };
        inputArea.focus();
    };
    
    // Ensure chat panel is open before showing banners
    const ensureChatOpen = () => {
        // PRIORITY: Look for the closed/collapsed chat input (GHL pattern)
        // When chat is closed, GHL shows an input with "Digite uma mensagem..." placeholder
        const closedChatInput = document.querySelector("input[id^='composer-input-']");
        
        if (closedChatInput && closedChatInput.offsetParent !== null) {
            const placeholder = closedChatInput.getAttribute('placeholder') || '';
            console.log("🔍 Bridge: Found composer input, placeholder:", placeholder);
            
            // If placeholder contains "Digite" or is a collapsed state indicator, click to expand
            if (placeholder.includes('Digite') || placeholder.includes('message') || placeholder.includes('Message')) {
                console.log("📱 Bridge: Clicking composer input to expand chat...");
                closedChatInput.click();
                closedChatInput.focus();
                return true; // Will need to wait for expansion
            }
        }
        
        // Fallback: Look for other closed chat indicators
        const chatInput = findMessageInput();
        
        // If no proper input is visible, try other methods
        if (!chatInput || chatInput.offsetParent === null) {
            console.log("🔍 Bridge: Chat appears closed, trying other methods...");
            
            // Try expand buttons
            const expandButtons = document.querySelectorAll('[data-testid*="expand"], [aria-label*="expand"], [aria-label*="abrir"], [aria-label*="open"]');
            for (const btn of expandButtons) {
                if (btn.offsetParent !== null) {
                    console.log("📱 Bridge: Clicking expand button...");
                    btn.click();
                    return true;
                }
            }
            
            // Try to find and click on the conversation row
            const conversationRow = document.querySelector('.hl_conversations--conversation-card.active, [class*="conversation"][class*="active"], [class*="selected"]');
            if (conversationRow) {
                console.log("📱 Bridge: Clicking conversation row to open chat...");
                conversationRow.click();
                return true;
            }
            
            return false; // Could not find way to open
        }
        
        return false; // Chat already open
    };
    
    // Show edit banner in input area (same pattern as reply)
    const showEditBanner = async (msgText, ghlId) => {
        clearReplyContext(); // Clear reply if switching to edit
        const existingBanner = document.getElementById('bridge-edit-banner');
        if (existingBanner) existingBanner.remove();
        
        // Try to open chat if closed
        const needsWait = ensureChatOpen();
        if (needsWait) {
            // Wait for chat to open
            await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        let inputArea = findMessageInput();
        
        // Retry finding input after potential open
        if (!inputArea || inputArea.offsetParent === null) {
            await new Promise(resolve => setTimeout(resolve, 500));
            inputArea = findMessageInput();
        }
        
        if (!inputArea || inputArea.offsetParent === null) {
            showToast("Abra o chat para editar a mensagem", true);
            return;
        }
        
        const banner = document.createElement('div');
        banner.id = 'bridge-edit-banner';
        banner.style.cssText = \`
            background: #fefce8; border-left: 4px solid #eab308; padding: 8px 12px;
            margin-bottom: 8px; border-radius: 4px; display: flex; justify-content: space-between;
            align-items: center; font-family: sans-serif; font-size: 13px;
        \`;
        banner.innerHTML = \`
            <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:80%;">
                <span style="color:#ca8a04; font-weight:600;">✏️ Editando:</span>
                <span style="color:#666; margin-left:8px;">\${msgText.substring(0, 50)}\${msgText.length > 50 ? '...' : ''}</span>
            </div>
            <span id="cancel-edit" style="cursor:pointer; color:#999; font-size:18px;">✕</span>
        \`;
        
        inputArea.parentElement.insertBefore(banner, inputArea);
        
        document.getElementById('cancel-edit').onclick = () => {
            banner.remove();
            editContext = null;
            clearInput(inputArea);
        };
        
        editContext = { ghlId, originalText: msgText };
        
        // Pre-fill input with original text
        if (inputArea.value !== undefined) {
            inputArea.value = msgText;
        } else if (inputArea.innerText !== undefined) {
            inputArea.innerText = msgText;
        }
        inputArea.dispatchEvent(new Event('input', { bubbles: true }));
        inputArea.focus();
        
        // Move cursor to end
        if (inputArea.setSelectionRange) {
            inputArea.setSelectionRange(msgText.length, msgText.length);
        }
    };
    
    // Clear edit context and banner
    const clearEditContext = () => {
        const banner = document.getElementById('bridge-edit-banner');
        if (banner) banner.remove();
        editContext = null;
        console.log("🧹 Bridge: Edit context cleared");
    };

    // Send reply action to backend
    const sendReply = async (replyText) => {
        if (!replyContext) return null;
        
        const { ghlId, locationId } = replyContext;
        console.log(\`↩️ Sending reply to \${ghlId} with text: \${replyText.substring(0, 50)}...\`);
        
        try {
            const url = BRIDGE_CONFIG.supabase_url + BRIDGE_CONFIG.endpoint;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'apikey': BRIDGE_CONFIG.supabase_anon_key,
                    'Authorization': \`Bearer \${BRIDGE_CONFIG.supabase_anon_key}\`,
                },
                body: JSON.stringify({ 
                    action: 'reply', 
                    ghl_id: ghlId, 
                    text: replyText,
                    location_id: locationId,
                    ghl_user_id: getGhlUserId()
                })
            });
            
            const data = await response.json();
            console.log("↩️ Reply response:", data);
            
            if (data.success) {
                showToast("Resposta enviada no WhatsApp!");
                return data;
            } else {
                showToast("Erro: " + (data.error || "Falha ao responder"), true);
                return null;
            }
        } catch (e) {
            console.error("❌ Reply error:", e);
            showToast("Erro de conexão: " + e.message, true);
            return null;
        }
    };

    // Find the active message input (GHL uses various input types)
    const findMessageInput = () => {
        // Try multiple selectors used by GHL - prioritize specific GHL selectors
        const selectors = [
            // GHL specific composer input (most reliable)
            'input[id^="composer-input"]',
            'input[placeholder*="Digite"]',
            'input[placeholder*="mensagem"]',
            // Generic message inputs
            'textarea[placeholder*="Type"]',
            'textarea[placeholder*="type"]',
            'textarea[placeholder*="Message"]',
            'textarea[placeholder*="message"]',
            'textarea[placeholder*="Digite"]',
            'textarea',
            '[contenteditable="true"]',
            'input[type="text"][placeholder*="message"]',
            'input[type="text"][placeholder*="Message"]'
        ];
        
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && (el.offsetParent !== null)) { // visible
                console.log("🎯 Bridge: Found input with selector:", sel);
                return el;
            }
        }
        
        // Last resort: return any visible text input
        const allInputs = document.querySelectorAll('input[type="text"], textarea');
        for (const el of allInputs) {
            if (el.offsetParent !== null) {
                console.log("🎯 Bridge: Found fallback input");
                return el;
            }
        }
        
        return null;
    };
    
    // Get text from input element
    const getInputText = (el) => {
        if (!el) return '';
        if (el.value !== undefined && el.value !== '') return el.value;
        if (el.innerText) return el.innerText;
        if (el.textContent) return el.textContent;
        return '';
    };
    
    // Clear input element
    const clearInput = (el) => {
        if (!el) return;
        if (el.value !== undefined) {
            el.value = '';
        } else if (el.innerText !== undefined) {
            el.innerText = '';
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    // Intercept keyboard Enter and send buttons to handle replies
    const interceptSendActions = () => {
        // Use document-level capture to intercept before GHL
        if (window.bridgeDocumentInterceptorAttached) return;
        window.bridgeDocumentInterceptorAttached = true;
        
        console.log("🎯 Bridge: Attaching document-level interceptors...");
        
        // Capture Enter key at document level
        document.addEventListener('keydown', async (e) => {
            // Only intercept Enter (not Shift+Enter)
            if (e.key !== 'Enter' || e.shiftKey) return;
            
            // Only if we have a reply or edit context
            if (!replyContext && !editContext) {
                return;
            }
            
            const inputArea = findMessageInput();
            const text = getInputText(inputArea);
            
            console.log("🔑 Bridge: Enter detected!", { 
                hasReplyContext: !!replyContext, 
                hasEditContext: !!editContext,
                text: text.substring(0, 50),
                inputTag: inputArea?.tagName
            });
            
            if (text.trim()) {
                // CRITICAL: Stop the event before it reaches GHL
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                if (editContext) {
                    // Handle edit
                    console.log("✏️ Bridge: Intercepted! Sending edit to WhatsApp...");
                    showToast("Editando mensagem...");
                    
                    // Include GHL user ID for attribution
                    const ghlUserId = getGhlUserId();
                    const result = await sendAction('edit', editContext.ghlId, { new_text: text.trim(), ghl_user_id: ghlUserId });
                    
                    if (result) {
                        console.log("✅ Bridge: Edit sent successfully");
                        showToast("Mensagem editada!");
                        clearInput(inputArea);
                        clearEditContext();
                    } else {
                        console.log("❌ Bridge: Edit failed");
                    }
                } else if (replyContext) {
                    // Handle reply
                    console.log("📤 Bridge: Intercepted! Sending reply to WhatsApp...");
                    showToast("Enviando resposta...");
                    
                    const result = await sendReply(text.trim());
                    
                    if (result) {
                        console.log("✅ Bridge: Reply sent successfully");
                        clearInput(inputArea);
                        clearReplyContext();
                    } else {
                        console.log("❌ Bridge: Reply failed");
                    }
                }
            }
        }, true); // Capture phase - runs BEFORE bubbling
        
        // Guard to prevent duplicate processing across pointerdown/mousedown/click
        let sendButtonProcessing = false;
        
        // Helper: handle send button interception for both edit and reply
        const handleSendButtonIntercept = async (e) => {
            // Only if we have a reply or edit context
            if (!replyContext && !editContext) return;
            if (sendButtonProcessing) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                return;
            }
            
            const target = e.target;
            
            // Try to find a button or clickable element
            const btn = target.closest('button, [role="button"], [data-testid*="send"], [class*="send"]');
            
            // Also check if we clicked directly on SVG/icon inside button
            const svgParent = target.closest('svg')?.closest('button, [role="button"]');
            const clickedElement = btn || svgParent;
            
            // Also detect based on location near input area
            const inputArea = findMessageInput();
            const isNearInput = inputArea && (() => {
                const inputRect = inputArea.getBoundingClientRect();
                const clickX = e.clientX;
                const clickY = e.clientY;
                // Button is likely to the right of or below the input
                return Math.abs(clickY - inputRect.bottom) < 100 && 
                       clickX > inputRect.right - 100;
            })();
            
            if (!clickedElement && !isNearInput) return;
            
            // Check if it looks like a send button
            let isSendButton = false;
            
            if (clickedElement) {
                const hasSendIcon = clickedElement.querySelector('svg');
                const btnText = (clickedElement.textContent || '').toLowerCase();
                const btnClass = (clickedElement.className || '').toLowerCase();
                const ariaLabel = (clickedElement.getAttribute('aria-label') || '').toLowerCase();
                
                isSendButton = hasSendIcon || 
                    btnText.includes('send') || btnText.includes('enviar') ||
                    btnClass.includes('send') || 
                    ariaLabel.includes('send') || ariaLabel.includes('enviar');
                    
                console.log("🔍 Bridge: Button analysis", {
                    hasSendIcon: !!hasSendIcon,
                    btnText,
                    btnClass,
                    ariaLabel,
                    isSendButton
                });
            }
            
            // If near input and clicked something clickable, assume it could be send
            if (isNearInput && (target.closest('button') || target.closest('svg'))) {
                isSendButton = true;
                console.log("🔍 Bridge: Assuming send button due to location near input");
            }
            
            if (!isSendButton) return;
            
            const text = getInputText(inputArea);
            
            console.log("🖱️ Bridge: Send button clicked!", { 
                hasReplyContext: !!replyContext, 
                hasEditContext: !!editContext,
                text: text.substring(0, 50),
                buttonClass: clickedElement?.className || 'unknown',
                isNearInput
            });
            
            if (text.trim()) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                sendButtonProcessing = true;
                
                try {
                    if (editContext) {
                        // Handle edit via button
                        console.log("✏️ Bridge: Sending edit via button...");
                        showToast("Editando mensagem...");
                        
                        // Include GHL user ID for attribution
                        const ghlUserId = getGhlUserId();
                        const result = await sendAction('edit', editContext.ghlId, { new_text: text.trim(), ghl_user_id: ghlUserId });
                        
                        if (result) {
                            console.log("✅ Bridge: Edit sent successfully via button");
                            showToast("Mensagem editada!");
                            clearInput(inputArea);
                            clearEditContext();
                        }
                    } else if (replyContext) {
                        // Handle reply via button
                        console.log("📤 Bridge: Sending reply via button...");
                        showToast("Enviando resposta...");
                        
                        const result = await sendReply(text.trim());
                        
                        if (result) {
                            console.log("✅ Bridge: Reply sent successfully via button");
                            clearInput(inputArea);
                            clearReplyContext();
                        }
                    }
                } finally {
                    sendButtonProcessing = false;
                }
            }
        };
        
        // Intercept pointerdown and mousedown (fire BEFORE click, preventing GHL from sending)
        document.addEventListener('pointerdown', handleSendButtonIntercept, true);
        document.addEventListener('mousedown', handleSendButtonIntercept, true);
        // Keep click as fallback
        document.addEventListener('click', handleSendButtonIntercept, true);
        
        console.log("✅ Bridge: Document-level interceptors attached successfully");
    };
    
    // Helper to clear reply context and banner
    const clearReplyContext = () => {
        const banner = document.getElementById('bridge-reply-banner');
        if (banner) banner.remove();
        replyContext = null;
        console.log("🧹 Bridge: Reply context cleared");
        console.log("✅ Reply context cleared");
    };

    window.openBridgeMenu = (e, triggerEl) => {
        e.preventDefault();
        e.stopPropagation();

        const parentItem = triggerEl.closest('[data-message-id]');
        const ghlId = parentItem ? parentItem.getAttribute('data-message-id') : null;
        const msgContainer = triggerEl.closest('.message-container');
        const isOutbound = msgContainer ? msgContainer.classList.contains('ml-auto') : false;
        
        if (!ghlId) {
            console.error("❌ ID da mensagem não encontrado no DOM");
            showToast("ID da mensagem não encontrado", true);
            return;
        }
        
        console.log("📂 Menu para ID:", ghlId, "| Outbound:", isOutbound);

        const prev = document.getElementById('bridge-whatsapp-menu');
        if (prev) prev.remove();

        const menu = document.createElement('div');
        menu.id = 'bridge-whatsapp-menu';
        
        const rect = triggerEl.getBoundingClientRect();
        
        // Calculate menu height estimate (quick emojis + options)
        // Quick emojis: ~50px, each option: ~45px, base padding: ~20px
        const hasEditDelete = isOutbound;
        const menuHeight = 50 + (hasEditDelete ? 4 * 45 : 2 * 45) + 20; // ~230px for outbound, ~140px for inbound
        
        // Open down if not enough space above
        const openDown = rect.top < menuHeight + 20;
        
        // When opening up, position menu so its bottom aligns just above the trigger
        const topPos = openDown ? rect.bottom + 5 : rect.top - menuHeight - 5;
        const leftPos = isOutbound ? rect.left - 200 : rect.left;

        // Ensure position doesn't go offscreen
        const adjustedLeft = Math.max(10, Math.min(leftPos, window.innerWidth - 260));
        const adjustedTop = Math.max(10, Math.min(topPos, window.innerHeight - 400));
        
        console.log("📍 Menu position:", { rect, openDown, menuHeight, topPos: adjustedTop, leftPos: adjustedLeft });
        
        menu.style.cssText = \`
            position: fixed !important; 
            top: \${adjustedTop}px !important; 
            left: \${adjustedLeft}px !important; 
            z-index: 2147483647 !important; 
            background: #ffffff !important; 
            background-color: #ffffff !important;
            border-radius: 12px !important; 
            box-shadow: 0 4px 20px rgba(0,0,0,0.3) !important; 
            width: 240px !important; 
            border: 1px solid #e0e0e0 !important; 
            font-family: -apple-system, BlinkMacSystemFont, sans-serif !important;
            pointer-events: auto !important;
            visibility: visible !important;
            opacity: 1 !important;
            display: block !important;
        \`;

        const quickEmojis = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
        const allEmojis = [
            // Smileys & Emotion
            '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '☺️', '😚', '😙', '🥲',
            '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔',
            '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '🧐', '😕', '😟',
            '🙁', '☹️', '😮', '😯', '😲', '😳', '🥺', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣', '😞', '😓', '😩', '😫', '🥱',
            '😤', '😡', '😠', '🤬', '😈', '👿', '💀', '☠️', '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖', '😺', '😸', '😹', '😻', '😼', '😽',
            '🙀', '😿', '😾', '🙈', '🙉', '🙊', '💋', '💌', '💘', '💝', '💖', '💗', '💓', '💞', '💕', '💟', '❣️', '💔', '❤️‍🔥', '❤️‍🩹', '❤️', '🧡',
            '💛', '💚', '💙', '💜', '🤎', '🖤', '🤍', '💯', '💢', '💥', '💫', '💦', '💨', '🕳️', '💣', '💬', '👁️‍🗨️', '🗨️', '🗯️', '💭', '💤',
            // Gestures & Body Parts
            '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊',
            '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🫀',
            '🫁', '🦷', '🦴', '👀', '👁️', '👅', '👄', '👶', '🧒', '👦', '👧', '🧑', '👱', '👨', '🧔', '👩', '🧓', '👴', '👵',
            // Animals & Nature
            '🐵', '🐒', '🦍', '🦧', '🐶', '🐕', '🦮', '🐕‍🦺', '🐩', '🐺', '🦊', '🦝', '🐱', '🐈', '🐈‍⬛', '🦁', '🐯', '🐅', '🐆', '🐴', '🐎', '🦄',
            '🦓', '🦌', '🦬', '🐮', '🐂', '🐃', '🐄', '🐷', '🐖', '🐗', '🐽', '🐏', '🐑', '🐐', '🐪', '🐫', '🦙', '🦒', '🐘', '🦣', '🦏', '🦛',
            '🐭', '🐁', '🐀', '🐹', '🐰', '🐇', '🐿️', '🦫', '🦔', '🦇', '🐻', '🐻‍❄️', '🐨', '🐼', '🦥', '🦦', '🦨', '🦘', '🦡', '🐾', '🦃', '🐔',
            '🐓', '🐣', '🐤', '🐥', '🐦', '🐧', '🕊️', '🦅', '🦆', '🦢', '🦉', '🦤', '🪶', '🦩', '🦚', '🦜', '🐸', '🐊', '🐢', '🦎', '🐍', '🐲',
            '🐉', '🦕', '🦖', '🐳', '🐋', '🐬', '🦭', '🐟', '🐠', '🐡', '🦈', '🐙', '🐚', '🐌', '🦋', '🐛', '🐜', '🐝', '🪲', '🐞', '🦗', '🪳',
            '🕷️', '🕸️', '🦂', '🦟', '🪰', '🪱', '🦠', '💐', '🌸', '💮', '🏵️', '🌹', '🥀', '🌺', '🌻', '🌼', '🌷', '🌱', '🪴', '🌲', '🌳', '🌴',
            '🌵', '🌾', '🌿', '☘️', '🍀', '🍁', '🍂', '🍃', '🍇', '🍈', '🍉', '🍊', '🍋', '🍌', '🍍', '🥭', '🍎', '🍏', '🍐', '🍑', '🍒', '🍓',
            '🫐', '🥝', '🍅', '🫒', '🥥', '🥑', '🍆', '🥔', '🥕', '🌽', '🌶️', '🫑', '🥒', '🥬', '🥦', '🧄', '🧅', '🍄', '🥜', '🌰',
            // Food & Drink
            '🍞', '🥐', '🥖', '🫓', '🥨', '🥯', '🥞', '🧇', '🧀', '🍖', '🍗', '🥩', '🥓', '🍔', '🍟', '🍕', '🌭', '🥪', '🌮', '🌯', '🫔', '🥙',
            '🧆', '🥚', '🍳', '🥘', '🍲', '🫕', '🥣', '🥗', '🍿', '🧈', '🧂', '🥫', '🍱', '🍘', '🍙', '🍚', '🍛', '🍜', '🍝', '🍠', '🍢', '🍣',
            '🍤', '🍥', '🥮', '🍡', '🥟', '🥠', '🥡', '🦀', '🦞', '🦐', '🦑', '🦪', '🍦', '🍧', '🍨', '🍩', '🍪', '🎂', '🍰', '🧁', '🥧', '🍫',
            '🍬', '🍭', '🍮', '🍯', '🍼', '🥛', '☕', '🫖', '🍵', '🍶', '🍾', '🍷', '🍸', '🍹', '🍺', '🍻', '🥂', '🥃', '🥤', '🧋', '🧃', '🧉', '🧊',
            // Activities & Sports
            '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🪀', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', '🥅', '⛳', '🪁', '🏹',
            '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛼', '🛷', '⛸️', '🥌', '🎿', '⛷️', '🏂', '🪂', '🏋️', '🤼', '🤸', '⛹️', '🤺', '🤾', '🏌️', '🏇',
            '⛑️', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🎗️', '🎫', '🎟️', '🎪', '🤹', '🎭', '🩰', '🎨', '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🪘',
            '🎷', '🎺', '🪗', '🎸', '🪕', '🎻', '🎲', '♟️', '🎯', '🎳', '🎮', '🎰', '🧩',
            // Travel & Places
            '🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '🏍️', '🛵', '🚲', '🛴', '🛺', '🚨', '🚔', '🚍',
            '🚘', '🚖', '🚡', '🚠', '🚟', '🚃', '🚋', '🚞', '🚝', '🚄', '🚅', '🚈', '🚂', '🚆', '🚇', '🚊', '🚉', '✈️', '🛫', '🛬', '🛩️', '💺',
            '🛰️', '🚀', '🛸', '🚁', '🛶', '⛵', '🚤', '🛥️', '🛳️', '⛴️', '🚢', '⚓', '🪝', '⛽', '🚧', '🚦', '🚥', '🚏', '🗺️', '🗿', '🗽', '🗼',
            '🏰', '🏯', '🏟️', '🎡', '🎢', '🎠', '⛲', '⛱️', '🏖️', '🏝️', '🏜️', '🌋', '⛰️', '🏔️', '🗻', '🏕️', '⛺', '🏠', '🏡', '🏘️', '🏚️', '🏗️',
            '🏢', '🏬', '🏣', '🏤', '🏥', '🏦', '🏨', '🏪', '🏫', '🏩', '💒', '🏛️', '⛪', '🕌', '🕍', '🛕', '🕋', '⛩️', '🛤️', '🛣️', '🗾', '🎑',
            '🏞️', '🌅', '🌄', '🌠', '🎇', '🎆', '🌇', '🌆', '🏙️', '🌃', '🌌', '🌉', '🌁',
            // Objects
            '⌚', '📱', '📲', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '🖲️', '🕹️', '🗜️', '💽', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥', '📽️', '🎞️',
            '📞', '☎️', '📟', '📠', '📺', '📻', '🎙️', '🎚️', '🎛️', '🧭', '⏱️', '⏲️', '⏰', '🕰️', '⌛', '⏳', '📡', '🔋', '🔌', '💡', '🔦', '🕯️',
            '🪔', '🧯', '🛢️', '💸', '💵', '💴', '💶', '💷', '🪙', '💰', '💳', '💎', '⚖️', '🪜', '🧰', '🪛', '🔧', '🔨', '⚒️', '🛠️', '⛏️', '🪚',
            '🔩', '⚙️', '🪤', '🧱', '⛓️', '🧲', '🔫', '💣', '🧨', '🪓', '🔪', '🗡️', '⚔️', '🛡️', '🚬', '⚰️', '🪦', '⚱️', '🏺', '🔮', '📿', '🧿',
            '💈', '⚗️', '🔭', '🔬', '🕳️', '🩹', '🩺', '💊', '💉', '🩸', '🧬', '🦠', '🧫', '🧪', '🌡️', '🧹', '🪠', '🧺', '🧻', '🚽', '🚰', '🚿',
            '🛁', '🛀', '🧼', '🪥', '🪒', '🧽', '🪣', '🧴', '🛎️', '🔑', '🗝️', '🚪', '🪑', '🛋️', '🛏️', '🛌', '🧸', '🪆', '🖼️', '🪞', '🪟', '🛍️',
            '🛒', '🎁', '🎈', '🎏', '🎀', '🪄', '🪅', '🎊', '🎉', '🎎', '🏮', '🎐', '🧧', '✉️', '📩', '📨', '📧', '💌', '📥', '📤', '📦', '🏷️',
            '🪧', '📪', '📫', '📬', '📭', '📮', '📯', '📜', '📃', '📄', '📑', '🧾', '📊', '📈', '📉', '🗒️', '🗓️', '📆', '📅', '🗑️', '📇', '🗃️',
            '🗳️', '🗄️', '📋', '📁', '📂', '🗂️', '🗞️', '📰', '📓', '📔', '📒', '📕', '📗', '📘', '📙', '📚', '📖', '🔖', '🧷', '🔗', '📎', '🖇️',
            '📐', '📏', '🧮', '📌', '📍', '✂️', '🖊️', '🖋️', '✒️', '🖌️', '🖍️', '📝', '✏️', '🔍', '🔎', '🔏', '🔐', '🔒', '🔓',
            // Symbols
            '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️',
            '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '🆔', '⚛️',
            '🉑', '☢️', '☣️', '📴', '📳', '🈶', '🈚', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🈴', '🈵', '🈹', '🈲', '🅰️', '🅱️',
            '🆎', '🆑', '🅾️', '🆘', '❌', '⭕', '🛑', '⛔', '📛', '🚫', '💯', '💢', '♨️', '🚷', '🚯', '🚳', '🚱', '🔞', '📵', '🚭', '❗', '❕',
            '❓', '❔', '‼️', '⁉️', '🔅', '🔆', '〽️', '⚠️', '🚸', '🔱', '⚜️', '🔰', '♻️', '✅', '🈯', '💹', '❇️', '✳️', '❎', '🌐', '💠', 'Ⓜ️',
            '🌀', '💤', '🏧', '🚾', '♿', '🅿️', '🛗', '🈳', '🈂️', '🛂', '🛃', '🛄', '🛅', '🚹', '🚺', '🚼', '⚧️', '🚻', '🚮', '🎦', '📶', '🈁',
            '🔣', 'ℹ️', '🔤', '🔡', '🔠', '🆖', '🆗', '🆙', '🆒', '🆕', '🆓', '0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟',
            '🔢', '#️⃣', '*️⃣', '⏏️', '▶️', '⏸️', '⏯️', '⏹️', '⏺️', '⏭️', '⏮️', '⏩', '⏪', '⏫', '⏬', '◀️', '🔼', '🔽', '➡️', '⬅️', '⬆️', '⬇️',
            '↗️', '↘️', '↙️', '↖️', '↕️', '↔️', '↪️', '↩️', '⤴️', '⤵️', '🔀', '🔁', '🔂', '🔄', '🔃', '🎵', '🎶', '➕', '➖', '➗', '✖️', '🟰',
            '♾️', '💲', '💱', '™️', '©️', '®️', '👁️‍🗨️', '🔚', '🔙', '🔛', '🔝', '🔜', '〰️', '➰', '➿', '✔️', '☑️', '🔘', '🔴', '🟠', '🟡', '🟢',
            '🔵', '🟣', '⚫', '⚪', '🟤', '🔺', '🔻', '🔸', '🔹', '🔶', '🔷', '🔳', '🔲', '▪️', '▫️', '◾', '◽', '◼️', '◻️', '🟥', '🟧', '🟨',
            '🟩', '🟦', '🟪', '⬛', '⬜', '🟫', '🔈', '🔇', '🔉', '🔊', '🔔', '🔕', '📣', '📢', '💬', '💭', '🗯️', '♠️', '♣️', '♥️', '♦️', '🃏',
            '🎴', '🀄', '🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛', '🕜', '🕝', '🕞', '🕟', '🕠', '🕡', '🕢', '🕣', '🕤', '🕥', '🕦', '🕧',
            // Flags (common ones)
            '🏳️', '🏴', '🏁', '🚩', '🏳️‍🌈', '🏳️‍⚧️', '🏴‍☠️', '🇧🇷', '🇺🇸', '🇬🇧', '🇪🇸', '🇫🇷', '🇩🇪', '🇮🇹', '🇵🇹', '🇯🇵', '🇨🇳', '🇰🇷', '🇲🇽', '🇦🇷', '🇨🇴', '🇨🇱'
        ];
        
        menu.innerHTML = \`
            <div id="emoji-quick" style="display:flex !important; justify-content:space-around; align-items:center; padding:12px; border-bottom:1px solid #e0e0e0; background:#ffffff !important;">
                \${quickEmojis.map(em => \`<span class="em-btn" style="cursor:pointer; font-size:22px; transition:transform 0.1s;" title="Reagir com \${em}">\${em}</span>\`).join('')}
                <span id="emoji-expand" style="cursor:pointer; font-size:14px; width:28px; height:28px; display:flex; align-items:center; justify-content:center; background:#9ca3af; color:white; border-radius:50%; transition:background 0.2s;" title="Mais emojis">+</span>
            </div>
            <div id="emoji-more" style="display:none; flex-wrap:wrap; justify-content:flex-start; gap:4px; padding:12px; border-bottom:1px solid #e0e0e0; max-height:200px; overflow-y:auto; background:#ffffff !important;">
                \${allEmojis.map(em => \`<span class="em-btn" style="cursor:pointer; font-size:20px; transition:transform 0.1s; padding:2px;" title="Reagir com \${em}">\${em}</span>\`).join('')}
            </div>
            <div class="menu-opt" data-act="reply" style="padding:12px 16px; cursor:pointer; display:flex; align-items:center; gap:12px; transition: background 0.2s; background:#ffffff !important; color:#333333 !important;"><span>↩️</span> Responder</div>
            <div class="menu-opt" data-act="copy" style="padding:12px 16px; cursor:pointer; display:flex; align-items:center; gap:12px; transition: background 0.2s; background:#ffffff !important; color:#333333 !important;"><span>📋</span> Copiar</div>
            \${isOutbound ? \`<div class="menu-opt" data-act="edit" style="padding:12px 16px; cursor:pointer; display:flex; align-items:center; gap:12px; transition: background 0.2s; background:#ffffff !important; color:#333333 !important;"><span>✏️</span> Editar</div>\` : ''}
            \${isOutbound ? \`<div class="menu-opt" data-act="delete" style="padding:12px 16px; cursor:pointer; display:flex; align-items:center; gap:12px; color:#ef4444 !important; transition: background 0.2s; background:#ffffff !important;"><span>🗑️</span> Apagar</div>\` : ''}
        \`;

        document.body.appendChild(menu);

        // Hover effect
        menu.querySelectorAll('.menu-opt').forEach(opt => {
            opt.addEventListener('mouseenter', () => opt.style.background = '#f5f5f5');
            opt.addEventListener('mouseleave', () => opt.style.background = '#ffffff');
        });

        // Expand emoji button
        const expandBtn = menu.querySelector('#emoji-expand');
        const morePanel = menu.querySelector('#emoji-more');
        let emojiExpanded = false;
        
        if (expandBtn && morePanel) {
            expandBtn.onclick = (e) => {
                e.stopPropagation();
                emojiExpanded = !emojiExpanded;
                morePanel.style.display = emojiExpanded ? 'flex' : 'none';
                expandBtn.innerText = emojiExpanded ? '➖' : '➕';
                expandBtn.style.background = emojiExpanded ? '#e0e0e0' : '#f0f0f0';
            };
        }

        // Emoji hover effect
        menu.querySelectorAll('.em-btn').forEach(btn => {
            btn.addEventListener('mouseenter', () => btn.style.transform = 'scale(1.2)');
            btn.addEventListener('mouseleave', () => btn.style.transform = 'scale(1)');
        });

        // Get message text from DOM
        const msgText = parentItem.querySelector('.text-\\\\[14px\\\\]')?.innerText || 
                        parentItem.querySelector('[class*="text-"]')?.innerText || 
                        parentItem.innerText?.substring(0, 200) || "";

        // Emoji reactions
        menu.querySelectorAll('.em-btn').forEach(btn => {
            btn.onclick = async () => {
                const emoji = btn.innerText;
                menu.remove();
                const result = await sendAction('react', ghlId, { emoji });
                if (result) showToast(\`Reagiu com \${emoji}\`);
            };
        });

        // Menu options
        menu.querySelectorAll('.menu-opt').forEach(opt => {
            opt.onclick = async () => {
                const act = opt.getAttribute('data-act');
                menu.remove();
                
                if (act === 'reply') {
                    // Extract location_id from URL or DOM
                    const urlMatch = window.location.href.match(/location[_/]?([a-zA-Z0-9]+)/i);
                    const locationId = urlMatch ? urlMatch[1] : null;
                    
                    if (!locationId) {
                        showToast("Não foi possível identificar a subconta", true);
                        return;
                    }
                    
                    await showReplyBanner(msgText, ghlId, locationId);
                    showToast("Digite sua resposta e envie normalmente");
                    return;
                }
                
                if (act === 'copy') {
                    navigator.clipboard.writeText(msgText);
                    showToast("Copiado!");
                    return;
                }
                
                if (act === 'edit') {
                    await showEditBanner(msgText, ghlId);
                    showToast("Edite o texto e envie normalmente");
                    return;
                }
                
                if (act === 'delete') {
                    if (confirm("Apagar esta mensagem para todos?")) {
                        const result = await sendAction('delete', ghlId, { from_me: isOutbound, ghl_user_id: getGhlUserId() });
                        if (result) showToast("Mensagem apagada!");
                    }
                    return;
                }
            };
        });

        // Close on outside click
        const outClick = (ev) => {
            if (!menu.contains(ev.target)) {
                menu.remove();
                document.removeEventListener('click', outClick);
            }
        };
        setTimeout(() => document.addEventListener('click', outClick), 50);
    };

    const inject = () => {
        const containers = document.querySelectorAll('.message-container:not(.bridge-v13)');
        
        containers.forEach(msg => {
            msg.classList.add('bridge-v13');
            // Use cached position for consistency
            const isOutbound = getIsOutbound(msg) || msg.classList.contains('ml-auto');
            
            // Observe message for visibility tracking
            const msgId = msg.getAttribute('data-message-id');
            if (msgId) {
                observeMessage(msg);
            }
            
            const btn = document.createElement('div');
            btn.className = 'bridge-trigger-v13';
            btn.innerHTML = '▼';
            btn.style.cssText = \`
                position: absolute; top: 5px; 
                \${isOutbound ? 'left: -32px;' : 'right: -32px;'} 
                width: 26px; height: 26px; background: #ffffff;
                border-radius: 50%; display: flex; align-items: center; 
                justify-content: center; cursor: pointer; z-index: 999;
                opacity: 0; transition: opacity 0.2s; font-size: 12px; color: #54656f;
                box-shadow: 0 2px 5px rgba(0,0,0,0.15); border: 1px solid #e0e0e0;
            \`;
            
            msg.style.setProperty('position', 'relative', 'important');
            
            msg.addEventListener('mouseenter', () => btn.style.opacity = '1');
            msg.addEventListener('mouseleave', () => btn.style.opacity = '0');
            
            btn.onclick = (e) => window.openBridgeMenu(e, btn);
            msg.appendChild(btn);
        });
        // Also intercept send buttons and keys for replies
        interceptSendActions();
    };

    // Expose reply context for send button integration
    window.getBridgeReplyContext = () => {
        const ctx = replyContext;
        replyContext = null;
        const banner = document.getElementById('bridge-reply-banner');
        if (banner) banner.remove();
        return ctx;
    };

    // ========== REALTIME: Message State Rendering ==========
    
    // Render deleted state on a message
    const renderDeletedState = (ghlId) => {
        const msgElement = document.querySelector(\`[data-message-id="\${ghlId}"]\`);
        if (!msgElement) return false;
        
        // Check if already rendered
        if (msgElement.querySelector('.bridge-deleted-overlay')) return true;
        
        const textContainer = msgElement.querySelector('.text-\\\\[14px\\\\]') || 
                              msgElement.querySelector('[class*="text-"]') ||
                              msgElement.querySelector('.message-content');
        
        if (!textContainer) return false;
        
        // Store original content
        const originalText = textContainer.innerText;
        
        // Create overlay structure
        const wrapper = document.createElement('div');
        wrapper.className = 'bridge-deleted-overlay';
        wrapper.style.cssText = \`
            background: #fef2f2; border: 1px solid #fee2e2; border-radius: 8px;
            padding: 8px 12px; font-family: sans-serif;
        \`;
        wrapper.innerHTML = \`
            <div style="color: #dc2626; font-size: 13px; font-weight: 600; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
                <span>❌</span> Essa mensagem foi apagada
            </div>
            <div style="border-top: 1px solid #fee2e2; padding-top: 8px; margin-top: 4px;">
                <span style="color: #9ca3af; text-decoration: line-through; font-size: 14px;">\${originalText}</span>
            </div>
        \`;
        
        // Replace content
        textContainer.innerHTML = '';
        textContainer.appendChild(wrapper);
        
        console.log("🗑️ Bridge: Rendered deleted state for", ghlId);
        return true;
    };
    
    // Render edited state on a message
    const renderEditedState = (ghlId, newText, originalText) => {
        const msgElement = document.querySelector(\`[data-message-id="\${ghlId}"]\`);
        if (!msgElement) return false;
        
        // Check if already rendered with same text
        const existing = msgElement.querySelector('.bridge-edited-overlay');
        if (existing && existing.dataset.newText === newText) return true;
        
        const textContainer = msgElement.querySelector('.text-\\\\[14px\\\\]') || 
                              msgElement.querySelector('[class*="text-"]') ||
                              msgElement.querySelector('.message-content');
        
        if (!textContainer) return false;
        
        // Get original text if not provided
        const origText = originalText || textContainer.innerText;
        
        // Create overlay structure
        const wrapper = document.createElement('div');
        wrapper.className = 'bridge-edited-overlay';
        wrapper.dataset.newText = newText;
        wrapper.style.cssText = \`
            background: #fefce8; border: 1px solid #fef08a; border-radius: 8px;
            padding: 8px 12px; font-family: sans-serif;
        \`;
        wrapper.innerHTML = \`
            <div style="color: #374151; font-size: 14px; margin-bottom: 4px;">\${newText}</div>
            <div style="border-top: 1px solid #fef08a; padding-top: 8px; margin-top: 4px; display: flex; justify-content: space-between; align-items: flex-end;">
                <span style="color: #9ca3af; font-size: 13px; font-style: italic;">\${origText}</span>
                <span style="color: #ca8a04; font-size: 11px; font-weight: 600; display: flex; align-items: center; gap: 4px;">
                    <span>✏️</span> editado
                </span>
            </div>
        \`;
        
        // Replace content
        textContainer.innerHTML = '';
        textContainer.appendChild(wrapper);
        
        console.log("✏️ Bridge: Rendered edited state for", ghlId);
        return true;
    };
    
    // Render replied state on a message (quote context)
    const renderRepliedState = (ghlId, quotedText, replyText) => {
        const msgElement = document.querySelector(\`[data-message-id="\${ghlId}"]\`);
        if (!msgElement) return false;
        
        // Check if already rendered
        if (msgElement.querySelector('.bridge-replied-overlay')) return true;
        
        const textContainer = msgElement.querySelector('.text-\\\\[14px\\\\]') || 
                              msgElement.querySelector('[class*="text-"]') ||
                              msgElement.querySelector('.message-content');
        
        if (!textContainer) return false;
        
        // Get current text as reply text if not provided
        const reply = replyText || textContainer.innerText;
        
        // Create overlay structure
        const wrapper = document.createElement('div');
        wrapper.className = 'bridge-replied-overlay';
        wrapper.style.cssText = \`
            background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px;
            padding: 8px 12px; font-family: sans-serif;
        \`;
        wrapper.innerHTML = \`
            <div style="color: #0369a1; font-size: 13px; font-style: italic; margin-bottom: 4px; padding: 6px; background: #e0f2fe; border-radius: 4px; border-left: 3px solid #0ea5e9;">\${quotedText}</div>
            <div style="border-top: 1px solid #bae6fd; padding-top: 8px; margin-top: 4px; display: flex; justify-content: space-between; align-items: flex-end;">
                <span style="color: #374151; font-size: 14px;">\${reply}</span>
                <span style="color: #0ea5e9; font-size: 11px; font-weight: 600; display: flex; align-items: center; gap: 4px;">
                    <span>↩️</span> Respondido
                </span>
            </div>
        \`;
        
        // Replace content
        textContainer.innerHTML = '';
        textContainer.appendChild(wrapper);
        
        console.log("↩️ Bridge: Rendered replied state for", ghlId);
        return true;
    };
    
    // Handle incoming realtime message updates
    const handleRealtimeUpdate = (payload) => {
        console.log("📡 Bridge Realtime:", payload);
        
        const { ghl_id, type, new_text, original_text, emoji, replyData, fromMe } = payload;
        
        if (!ghl_id) return;
        
        if (type === 'delete') {
            // Only show overlay for inbound (lead) deletions
            // Outbound (user) deletions are handled via InternalComment in GHL
            if (fromMe) {
                console.log("🗑️ Bridge: Outbound delete - handled via InternalComment, no overlay", { ghl_id });
                return;
            }
            
            // Use original_text from payload if available, otherwise try to get from DOM
            const msgEl = document.querySelector(\`[data-message-id="\${ghl_id}"]\`);
            const textFromDom = msgEl?.querySelector('.text-\\\\[14px\\\\]')?.innerText || 
                               msgEl?.querySelector('[class*="text-"]')?.innerText || '';
            const textToShow = original_text || textFromDom || '(mensagem apagada)';
            
            // Store original text before rendering overlay
            if (msgEl && !msgEl.dataset.originalText) {
                msgEl.dataset.originalText = textFromDom;
            }
            
            renderDeletedState(ghl_id);
            console.log("🗑️ Bridge: Processed inbound delete event", { ghl_id, fromMe, hasOriginalText: !!original_text });
        } else if (type === 'edit') {
            // All edits are now handled via InternalComment in GHL
            // No overlay needed for either inbound or outbound
            console.log("✏️ Bridge: Edit event received - handled via InternalComment, no overlay", { ghl_id, fromMe });
        } else if (type === 'reply' && replyData?.text) {
            // The ghl_id here is the MESSAGE BEING REPLIED TO
            // We show a badge/indicator that someone replied to this message
            const msgEl = document.querySelector(\`[data-message-id="\${ghl_id}"]\`);
            if (msgEl) {
                // Check if we already have a replied indicator
                if (!msgEl.querySelector('.bridge-was-replied-badge')) {
                    const badge = document.createElement('span');
                    badge.className = 'bridge-was-replied-badge';
                    badge.style.cssText = 'position: absolute; bottom: -8px; left: 8px; background: #e0f2fe; border: 1px solid #0ea5e9; border-radius: 8px; padding: 2px 8px; font-size: 11px; color: #0369a1; font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,0.1);';
                    badge.innerText = '↩️ Respondida';
                    badge.title = 'Alguém respondeu a esta mensagem: ' + (replyData.text || '').substring(0, 50);
                    msgEl.style.position = 'relative';
                    msgEl.appendChild(badge);
                }
            }
            console.log("↩️ Bridge: Processed reply event", { ghl_id, replyText: replyData?.text?.substring(0, 30) });
        } else if (type === 'react' && emoji) {
            // Render reaction badge on message
            const msgEl = document.querySelector(\`[data-message-id="\${ghl_id}"]\`);
            if (msgEl) {
                // Use cached position calculation for performance
                const isOutbound = getIsOutbound(msgEl);
                const badgePosition = isOutbound ? 'right: 8px;' : 'left: 8px;';
                
                // Replace reaction (not accumulate) - user can only have one active reaction
                const existingBadge = msgEl.querySelector('.bridge-reaction-badge');
                if (existingBadge) {
                    // Replace with new emoji
                    existingBadge.innerText = emoji;
                    // Update position in case it changed
                    existingBadge.style.cssText = \`position: absolute; bottom: -8px; \${badgePosition} background: white; border-radius: 12px; padding: 2px 6px; font-size: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);\`;
                } else {
                    // Create new badge
                    const badge = document.createElement('span');
                    badge.className = 'bridge-reaction-badge';
                    badge.style.cssText = \`position: absolute; bottom: -8px; \${badgePosition} background: white; border-radius: 12px; padding: 2px 6px; font-size: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);\`;
                    badge.innerText = emoji;
                    msgEl.style.position = 'relative';
                    msgEl.appendChild(badge);
                }
            }
            console.log("😊 Bridge: Processed react event", { ghl_id, emoji });
        }
    };
    
    // Initialize Supabase Realtime connection
    const initRealtime = () => {
        if (realtimeChannel) return; // Already connected
        
        // Create a simple Realtime connection using native WebSocket
        // Supabase Realtime uses Phoenix protocol
        const wsUrl = BRIDGE_CONFIG.supabase_url.replace('https://', 'wss://') + 
                      '/realtime/v1/websocket?apikey=' + BRIDGE_CONFIG.supabase_anon_key + 
                      '&vsn=1.0.0';
        
        console.log("🔌 Bridge: Connecting to Realtime...");
        
        const ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
            console.log("✅ Bridge Realtime: Connected");
            
            // Join the ghl_updates channel
            const joinMsg = {
                topic: 'realtime:ghl_updates',
                event: 'phx_join',
                payload: {},
                ref: '1'
            };
            ws.send(JSON.stringify(joinMsg));
            
            // Heartbeat to keep connection alive
            setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: Date.now().toString() }));
                }
            }, 30000);
        };
        
        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                
                // Handle broadcast messages on ghl_updates channel
                if (msg.topic === 'realtime:ghl_updates' && msg.event === 'broadcast') {
                    if (msg.payload?.payload) {
                    // Debounced update for rapid events
                    const payload = msg.payload.payload;
                    const ghlId = payload.ghl_id;
                    
                    // Log if message not currently visible
                    if (ghlId && !visibleMessages.has(ghlId)) {
                        console.log("⏳ Bridge: Update for non-visible message", ghlId);
                    }
                    
                    handleRealtimeUpdate(payload);
                    }
                }
            } catch (e) {
                console.error("❌ Bridge Realtime parse error:", e);
            }
        };
        
        ws.onerror = (err) => {
            console.error("❌ Bridge Realtime error:", err);
        };
        
        ws.onclose = () => {
            console.log("🔌 Bridge Realtime: Disconnected, reconnecting in 5s...");
            realtimeChannel = null;
            setTimeout(initRealtime, 5000);
        };
        
        realtimeChannel = ws;
    };

    // ========== PERSISTENCE: Load states on page load ==========
    
    // Collect all GHL message IDs visible in the current page
    const collectVisibleMessageIds = () => {
        const messageElements = document.querySelectorAll('[data-message-id]');
        const ids = [];
        messageElements.forEach(el => {
            const id = el.getAttribute('data-message-id');
            if (id) ids.push(id);
        });
        return ids;
    };
    
    // Load persisted states from backend and render them
    const loadPersistedStates = async () => {
        const ghlIds = collectVisibleMessageIds();
        if (ghlIds.length === 0) {
            console.log("📋 Bridge: No messages visible yet, will retry...");
            return false;
        }
        
        console.log("📋 Bridge: Loading persisted states for", ghlIds.length, "messages");
        
        try {
            const url = BRIDGE_CONFIG.supabase_url + BRIDGE_CONFIG.endpoint;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'apikey': BRIDGE_CONFIG.supabase_anon_key,
                    'Authorization': \`Bearer \${BRIDGE_CONFIG.supabase_anon_key}\`,
                },
                body: JSON.stringify({ action: 'list-states', ghl_ids: ghlIds })
            });
            
            const data = await response.json();
            
            if (data.success && data.states) {
                console.log("📋 Bridge: Received", data.states.length, "modified message states");
                
                data.states.forEach(state => {
                    // Only show overlay for inbound (lead) deletions
                    // Outbound (user) deletions are handled via InternalComment in GHL
                    if (state.is_deleted && !state.from_me) {
                        renderDeletedState(state.ghl_id);
                    }
                    // Edit states are now handled via InternalComment - no overlay needed
                    
                    // Render reactions if any
                    if (state.reactions && state.reactions.length > 0) {
                        // With the new logic, reactions array should have at most 1 emoji (replacement model)
                        const currentReaction = state.reactions[state.reactions.length - 1];
                        const msgEl = document.querySelector(\`[data-message-id="\${state.ghl_id}"]\`);
                        if (msgEl && !msgEl.querySelector('.bridge-reaction-badge')) {
                            // Use cached position calculation for performance
                            const isOutbound = getIsOutbound(msgEl);
                            const badgePosition = isOutbound ? 'right: 8px;' : 'left: 8px;';
                            
                            const badge = document.createElement('span');
                            badge.className = 'bridge-reaction-badge';
                            badge.style.cssText = \`position: absolute; bottom: -8px; \${badgePosition} background: white; border-radius: 12px; padding: 2px 6px; font-size: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);\`;
                            badge.innerText = currentReaction;
                            msgEl.style.position = 'relative';
                            msgEl.appendChild(badge);
                        }
                    }
                });
                
                return true;
            }
        } catch (e) {
            console.error("❌ Bridge: Failed to load persisted states:", e);
        }
        
        return false;
    };
    
    // Retry loading states until messages are visible
    const initPersistence = async () => {
        let attempts = 0;
        const maxAttempts = 10;
        
        const tryLoad = async () => {
            attempts++;
            const success = await loadPersistedStates();
            
            if (!success && attempts < maxAttempts) {
                setTimeout(tryLoad, 1000);
            } else if (success) {
                console.log("✅ Bridge: Persisted states loaded successfully");
            }
        };
        
        // Start after a delay to let the page render
        setTimeout(tryLoad, 1500);
        
        // Also reload when URL changes (conversation switch)
        let lastUrl = location.href;
        setInterval(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                console.log("🔄 Bridge: URL changed, reloading states...");
                attempts = 0;
                setTimeout(tryLoad, 1000);
            }
        }, 500);
    };

    setInterval(inject, 1000);
    
    // Initialize Intersection Observer
    initMessageObserver();
    
    // Initialize Realtime after a short delay
    setTimeout(initRealtime, 2000);
    
    // Initialize persistence (load states on page load)
    initPersistence();
    
    console.log("✅ Bridge Toolkit v22 carregado (Menu Fix)!");
})();
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(BRIDGE_TOOLKIT_SCRIPT, {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=60, must-revalidate",
    },
  });
});
