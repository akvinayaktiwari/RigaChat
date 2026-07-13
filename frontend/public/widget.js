(function () {
  'use strict';
  var BACKEND_URL = '__BACKEND_URL__';
  var SS_WIDGET_STATE = 'beepboop_widget_state';
  var SS_LEAD_CAPTURED = 'beepboop_lead_captured';
  var SS_LEAD_DATA = 'beepboop_lead_data';
  var SS_CONV_ID = 'beepboop_conv_id';
  function ssGet(key) {
    try { return sessionStorage.getItem(key); } catch (e) { return null; }
  }
  function ssSet(key, val) {
    try { sessionStorage.setItem(key, val); } catch (e) { /* ignore */ }
  }
  function getBotId() {
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].getAttribute('src') || '';
      if (src.indexOf('widget.js') !== -1) {
        return scripts[i].getAttribute('data-bot-id');
      }
    }
    return null;
  }
  var botId = getBotId();
  if (!botId) {
    if (window.console && console.warn) {
      console.warn('[ChatIQ] Missing data-bot-id on widget script tag.');
    }
    return;
  }
  var state = {
    isOpen: false,
    conversationId: null,
    messages: [],
    isLoading: false,
    leadCaptured: false,
    botConfig: null,
    started: false,
    suggestions: [],
    showSuggestions: true,
    unreadCount: 0,
    leadFields: [],
    leadValues: {},
    leadCardIndex: -1,
    leadSequenceActive: false,
    leadSequenceDone: false,
    maximized: false
  };
  var shadowRoot = null;
  var els = {};
  var CSS_TEMPLATE =
    "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');" +
    ':host{all:initial;--brand:__BRAND__}' +
    '*{box-sizing:border-box;font-family:"Inter",Arial,sans-serif;margin:0;padding:0}' +
    '.ciq-hidden{display:none!important}' +
    '#ciq-bubble{position:fixed;bottom:20px;right:20px;width:60px;height:60px;border-radius:50%;' +
    'background:var(--brand);box-shadow:0 8px 24px rgba(0,0,0,.25);' +
    'z-index:999999;cursor:pointer;border:none;display:flex;align-items:center;justify-content:center;padding:0;' +
    'transform:scale(0);opacity:0;pointer-events:none;transition:transform .2s ease,opacity .2s ease}' +
    '#ciq-bubble.ciq-show{transform:scale(1);opacity:1;pointer-events:auto}' +
    '#ciq-bubble:hover{filter:brightness(1.08)}' +
    '#ciq-bubble:active{filter:brightness(.95)}' +
    '#ciq-bubble-icon{font-size:28px;color:#fff;line-height:1}' +
    '#ciq-bubble-badge{position:absolute;top:-4px;left:-4px;min-width:18px;height:18px;padding:0 4px;' +
    'border-radius:9px;background:#ef4444;color:#fff;font-size:11px;font-weight:700;' +
    'display:flex;align-items:center;justify-content:center;line-height:1}' +
    '#ciq-window{position:fixed;bottom:96px;right:20px;width:420px;height:650px;background:#fff;' +
    'border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.15);border:1px solid #e5e7eb;z-index:999998;' +
    'display:flex;flex-direction:column;overflow:hidden;transform-origin:bottom right;transform:scale(.95);' +
    'opacity:0;pointer-events:none;transition:transform .2s ease,opacity .2s ease}' +
    '#ciq-window.ciq-open{transform:scale(1);opacity:1;pointer-events:auto}' +
    '#ciq-header{background:var(--brand);padding:16px;display:flex;align-items:center;gap:12px}' +
    '#ciq-avatar{flex-shrink:0;width:36px;height:36px;border-radius:50%;background:var(--brand);' +
    'border:1.5px solid rgba(255,255,255,.4);display:flex;align-items:center;justify-content:center;' +
    'font-weight:700;font-size:13px;color:#fff}' +
    '#ciq-header-info{flex:1;min-width:0}' +
    '#ciq-bot-name{font-weight:700;font-size:14px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#ciq-subtitle{font-size:12px;color:rgba(255,255,255,.8);margin-top:2px}' +
    '#ciq-header-actions{display:flex;align-items:center;gap:4px;flex-shrink:0}' +
    '.ciq-icon-btn{width:32px;height:32px;flex-shrink:0;background:transparent;border:none;' +
    'color:#fff;cursor:pointer;border-radius:50%;display:flex;align-items:center;justify-content:center;' +
    'padding:0;transition:opacity .15s}' +
    '.ciq-icon-btn:hover{opacity:.8}' +
    '#ciq-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;' +
    'background:rgba(249,250,251,.3)}' +
    '#ciq-messages::-webkit-scrollbar{width:4px}' +
    '#ciq-messages::-webkit-scrollbar-track{background:transparent}' +
    '#ciq-messages::-webkit-scrollbar-thumb{background:#e5e7eb;border-radius:4px}' +
    '.ciq-msg-bot{background:#f3f4f6;color:#111827;align-self:flex-start;padding:10px 14px;' +
    'border-radius:16px;border-top-left-radius:4px;border:1px solid #e5e7eb;max-width:85%;' +
    'font-size:14px;line-height:1.5}' +
    '.ciq-msg-user{background:var(--brand);color:#fff;align-self:flex-end;padding:10px 14px;' +
    'border-radius:16px;border-top-right-radius:4px;max-width:85%;font-size:14px;line-height:1.5}' +
    '.ciq-msg-text{white-space:pre-wrap;word-break:break-word}' +
    '.ciq-msg-time{font-size:9px;text-align:right;margin-top:6px}' +
    '.ciq-msg-bot .ciq-msg-time{color:#6b7280}' +
    '.ciq-msg-user .ciq-msg-time{color:rgba(255,255,255,.6)}' +
    '.ciq-typing{background:#f3f4f6;border:1px solid #e5e7eb;align-self:flex-start;padding:12px 14px;' +
    'border-radius:16px;border-top-left-radius:4px;display:flex;gap:4px}' +
    '.ciq-typing span{display:inline-block;width:8px;height:8px;border-radius:50%;background:#9ca3af;' +
    'animation:bb-bounce 1s infinite}' +
    '.ciq-typing span:nth-child(2){animation-delay:.2s}' +
    '.ciq-typing span:nth-child(3){animation-delay:.4s}' +
    '@keyframes bb-bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}' +
    '.ciq-lead-card{position:relative;padding-right:20px}' +
    '.ciq-lead-card-label{font-size:13px;font-weight:600;margin-bottom:8px}' +
    '.ciq-lead-card-row{display:flex;gap:6px}' +
    '.ciq-lead-card-input{flex:1;padding:8px 10px;border:1px solid #e5e7eb;border-radius:8px;' +
    'font-size:13px;outline:none;background:#fff}' +
    '.ciq-lead-card-input:focus{border-color:var(--brand)}' +
    '.ciq-lead-card-input:disabled{background:#f3f4f6;color:#9ca3af}' +
    '.ciq-lead-card-submit{width:32px;height:32px;flex-shrink:0;border:none;border-radius:8px;' +
    'background:var(--brand);color:#fff;font-size:15px;cursor:pointer;display:flex;align-items:center;' +
    'justify-content:center;transition:opacity .15s}' +
    '.ciq-lead-card-submit:disabled{opacity:.4;cursor:default}' +
    '.ciq-lead-card-skip{position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;' +
    'border:1px solid #e5e7eb;background:#fff;color:#6b7280;font-size:12px;line-height:1;cursor:pointer;' +
    'display:flex;align-items:center;justify-content:center}' +
    '#ciq-input-area{display:flex;padding:12px;gap:8px;background:#fff;border-top:1px solid #e5e7eb}' +
    '#ciq-input{flex:1;padding:10px 16px;border:1px solid #e5e7eb;border-radius:12px;font-size:14px;' +
    'background:#f9fafb;outline:none}' +
    '#ciq-input:focus{border-color:var(--brand)}' +
    '#ciq-input::placeholder{color:#6b7280}' +
    '#ciq-input:disabled{background:#f3f4f6;color:#9ca3af;cursor:not-allowed}' +
    '#ciq-send{width:40px;height:40px;background:var(--brand);border:none;' +
    'border-radius:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;' +
    'transition:opacity .15s}' +
    '#ciq-send:hover{opacity:.9}' +
    '#ciq-send:disabled{opacity:.4;cursor:default}' +
    '#ciq-input-hint{font-size:11px;color:#9ca3af;text-align:center;padding:0 12px 8px 12px}' +
    '#ciq-footer{font-size:11px;color:#9ca3af;text-align:center;padding:6px 12px 10px 12px}' +
    '#ciq-suggestions{display:flex;flex-wrap:wrap;gap:8px;padding:0 16px 12px 16px}' +
    '.ciq-chip{display:flex;align-items:center;gap:6px;padding:8px 12px;background:#fff;' +
    'border:1px solid #e5e7eb;border-radius:999px;font-size:13px;color:#111827;cursor:pointer;' +
    'transition:background .2s,border-color .2s,color .2s;box-shadow:0 1px 2px rgba(0,0,0,.04)}' +
    '.ciq-chip:hover{background:#f9fafb;border-color:var(--brand);color:var(--brand)}' +
    '.ciq-chip-text{font-weight:500}';
  var SEND_ICON =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<line x1="22" y1="2" x2="11" y2="13" stroke="white" stroke-width="2"/>' +
    '<polygon points="22 2 15 22 11 13 2 9 22 2" fill="white"/></svg>';
  var BUBBLE_CHAT_ICON =
    '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" ' +
    'stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';
  var BUBBLE_CLOSE_ICON =
    '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<line x1="18" y1="6" x2="6" y2="18" stroke="white" stroke-width="2.5" stroke-linecap="round"/>' +
    '<line x1="6" y1="6" x2="18" y2="18" stroke="white" stroke-width="2.5" stroke-linecap="round"/>' +
    '</svg>';
  var BACK_ICON =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M19 12H5M12 19l-7-7 7-7"/></svg>';
  var EXPAND_ICON =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M15 3 L21 3 L21 9"/><path d="M9 21 L3 21 L3 15"/>' +
    '<path d="M21 3 L14 10"/><path d="M3 21 L10 14"/></svg>';
  var COMPRESS_ICON =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M14 10 L20 4"/><path d="M4 20 L10 14"/>' +
    '<path d="M20 4 L20 9 M20 4 L15 4"/><path d="M4 20 L4 15 M4 20 L9 20"/></svg>';
  var REFRESH_ICON =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M23 4v6h-6M1 20v-6h6" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var MAIL_ICON =
    '<svg width="16" height="16" viewBox="0 0 24 24"' +
    ' fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9' +
    ' 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"' +
    ' stroke="white" stroke-width="2"' +
    ' stroke-linecap="round" stroke-linejoin="round"/>' +
    '<polyline points="22,6 12,13 2,6"' +
    ' stroke="white" stroke-width="2"' +
    ' stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';
  var SHELL_HTML =
    '<button id="ciq-bubble" aria-label="Open chat">' +
    '<span id="ciq-bubble-icon"></span>' +
    '<span id="ciq-bubble-badge" class="ciq-hidden">0</span>' +
    '</button>' +
    '<div id="ciq-window">' +
    '<div id="ciq-header">' +
    '<button id="ciq-back" class="ciq-icon-btn" aria-label="Minimize chat">' + BACK_ICON + '</button>' +
    '<div id="ciq-avatar"></div>' +
    '<div id="ciq-header-info">' +
    '<div id="ciq-bot-name"></div>' +
    '<div id="ciq-subtitle">AI Assistant</div>' +
    '</div>' +
    '<div id="ciq-header-actions">' +
    '<button id="ciq-refresh" class="ciq-icon-btn" aria-label="Start new conversation">' + REFRESH_ICON + '</button>' +
    '<button id="ciq-mail" class="ciq-icon-btn ciq-hidden" aria-label="Email support">' + MAIL_ICON + '</button>' +
    '<button id="ciq-expand" class="ciq-icon-btn" aria-label="Expand chat">' + EXPAND_ICON + '</button>' +
    '</div>' +
    '</div>' +
    '<div id="ciq-messages"></div>' +
    '<div id="ciq-suggestions"></div>' +
    '<div id="ciq-input-area">' +
    '<input id="ciq-input" type="text" placeholder="Type a message..." />' +
    '<button id="ciq-send" aria-label="Send message">' + SEND_ICON + '</button></div>' +
    '<div id="ciq-input-hint" class="ciq-hidden">Please fill in the details above to continue</div>' +
    '<div id="ciq-footer">Powered by VyostraAI</div>' +
    '</div>';
  function init() {
    fetch(BACKEND_URL + '/api/bots/public/' + encodeURIComponent(botId))
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (!json || !json.success || !json.data) return;
        state.botConfig = json.data;
        mount();
      })
      .catch(function () {
        /* exit silently, never break the host site */
      });
  }
  function restoreSessionState() {
    if (ssGet(SS_LEAD_CAPTURED) === 'true') {
      state.leadCaptured = true;
      state.leadSequenceDone = true;
    }
    var storedLeadData = ssGet(SS_LEAD_DATA);
    if (storedLeadData) {
      try {
        var parsed = JSON.parse(storedLeadData);
        state.leadValues = parsed.values || {};
        if (parsed.done) state.leadSequenceDone = true;
      } catch (e) { /* ignore malformed storage */ }
    }
  }
  function mount() {
    try {
      var host = document.createElement('div');
      host.id = 'chatiq-widget-host';
      document.body.appendChild(host);
      shadowRoot = host.attachShadow({ mode: 'open' });
      var style = document.createElement('style');
      style.textContent = CSS_TEMPLATE.replace(/__BRAND__/g, state.botConfig.brandColor || '#6366f1');
      shadowRoot.appendChild(style);
      var container = document.createElement('div');
      container.innerHTML = SHELL_HTML;
      while (container.firstChild) {
        shadowRoot.appendChild(container.firstChild);
      }
      els.bubble = shadowRoot.getElementById('ciq-bubble');
      els.bubbleBadge = shadowRoot.getElementById('ciq-bubble-badge');
      els.bubbleIcon = shadowRoot.getElementById('ciq-bubble-icon');
      els.bubbleIcon.innerHTML = BUBBLE_CHAT_ICON;
      els.window = shadowRoot.getElementById('ciq-window');
      els.avatar = shadowRoot.getElementById('ciq-avatar');
      els.botName = shadowRoot.getElementById('ciq-bot-name');
      els.back = shadowRoot.getElementById('ciq-back');
      els.refresh = shadowRoot.getElementById('ciq-refresh');
      els.expand = shadowRoot.getElementById('ciq-expand');
      els.mail = shadowRoot.getElementById('ciq-mail');
      els.messages = shadowRoot.getElementById('ciq-messages');
      els.suggestions = shadowRoot.getElementById('ciq-suggestions');
      els.input = shadowRoot.getElementById('ciq-input');
      els.send = shadowRoot.getElementById('ciq-send');
      els.inputHint = shadowRoot.getElementById('ciq-input-hint');
      var botName = state.botConfig.name || '';
      els.botName.textContent = botName;
      els.avatar.textContent = (botName || 'AI').trim().substring(0, 2).toUpperCase();
      if (state.botConfig.supportEmail) {
        els.mail.classList.remove('ciq-hidden');
      }
      state.leadFields = (state.botConfig.leadFormFields || []).slice();
      restoreSessionState();
      pickSuggestions();
      bindEvents();
      applyResponsiveSize();
      window.addEventListener('resize', handleResize);
      var storedWidgetState = ssGet(SS_WIDGET_STATE);
      if (storedWidgetState === 'open' || storedWidgetState === 'maximized') {
        els.bubbleIcon.innerHTML = BUBBLE_CLOSE_ICON;
        if (storedWidgetState === 'maximized') {
          state.maximized = true;
          applyMaximizedSize();
          els.expand.innerHTML = COMPRESS_ICON;
          els.expand.setAttribute('aria-label', 'Compress chat');
        } else {
          applyResponsiveSize();
        }
        state.isOpen = true;
        els.window.classList.add('ciq-open');
        if (!state.started) {
          state.started = true;
          startConversation();
        }
      } else if (storedWidgetState === 'bubble') {
        showBubble();
      } else {
        applyTrigger();
      }
    } catch (e) {
      /* never break the host site */
    }
  }
  function showBubble() {
    if (els.bubble) els.bubble.classList.add('ciq-show');
  }
  function updateBubbleBadge() {
    if (!els.bubbleBadge) return;
    if (state.unreadCount > 0) {
      els.bubbleBadge.textContent = String(state.unreadCount);
      els.bubbleBadge.classList.remove('ciq-hidden');
    } else {
      els.bubbleBadge.classList.add('ciq-hidden');
    }
  }
  function pickSuggestions() {
    var pool = (state.botConfig.suggestedQuestions || []).slice();
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    state.suggestions = pool.slice(0, 4);
  }
  function renderSuggestions() {
    els.suggestions.innerHTML = '';
    if (!state.showSuggestions || !state.suggestions.length) return;
    state.suggestions.forEach(function (s) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'ciq-chip';
      var emojiSpan = document.createElement('span');
      emojiSpan.textContent = s.emoji || '';
      var textSpan = document.createElement('span');
      textSpan.className = 'ciq-chip-text';
      textSpan.textContent = s.question;
      chip.appendChild(emojiSpan);
      chip.appendChild(textSpan);
      chip.addEventListener('click', function () {
        handleSuggestionClick(s);
      });
      els.suggestions.appendChild(chip);
    });
  }
  function handleSuggestionClick(s) {
    state.showSuggestions = false;
    renderSuggestions();
    state.messages.push({ role: 'user', text: s.question });
    addMessage('user', s.question);
    sendMessage(s.question);
  }
  function applyTrigger() {
    var trigger = state.botConfig.widgetTrigger;
    if (trigger === 'immediate') {
      showBubble();
      return;
    }
    if (trigger === 'delay_5s') {
      setTimeout(showBubble, 5000);
      return;
    }
    if (trigger === 'scroll_50') {
      var onScroll = function () {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        var pct = max > 0 ? window.scrollY / max : 1;
        if (pct >= 0.5) {
          showBubble();
          window.removeEventListener('scroll', onScroll);
        }
      };
      window.addEventListener('scroll', onScroll);
      return;
    }
    if (trigger === 'exit_intent') {
      var onMouseMove = function (e) {
        if (e.clientY <= 20) {
          showBubble();
          document.removeEventListener('mousemove', onMouseMove);
        }
      };
      document.addEventListener('mousemove', onMouseMove);
      return;
    }
    showBubble();
  }
  function bindEvents() {
    els.bubble.addEventListener('click', function() {
      if (state.isOpen) {
        goToBubble();
      } else {
        openChat();
      }
    });
    els.back.addEventListener('click', goToBubble);
    els.refresh.addEventListener('click', handleRefresh);
    els.expand.addEventListener('click', handleExpandToggle);
    els.mail.addEventListener('click', function() {
      var email = state.botConfig.supportEmail;
      if (!email) return;
      var botName = state.botConfig.name || 'Support';
      var subject = encodeURIComponent(
        'Support Request — ' + botName
      );
      window.open(
        'mailto:' + email + '?subject=' + subject,
        '_blank'
      );
    });
    els.send.addEventListener('click', handleSend);
    els.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') handleSend();
    });
  }
  function openChat() {
    state.maximized = false;
    applyResponsiveSize();
    els.expand.innerHTML = EXPAND_ICON;
    els.expand.setAttribute('aria-label', 'Expand chat');
    state.isOpen = true;
    ssSet(SS_WIDGET_STATE, 'open');
    els.window.classList.add('ciq-open');
    els.bubbleIcon.innerHTML = BUBBLE_CLOSE_ICON;
    state.unreadCount = 0;
    updateBubbleBadge();
    if (!state.started) {
      state.started = true;
      startConversation();
    }
  }
  function goToBubble() {
    state.isOpen = false;
    ssSet(SS_WIDGET_STATE, 'bubble');
    els.window.classList.remove('ciq-open');
    els.bubbleIcon.innerHTML = BUBBLE_CHAT_ICON;
    els.bubble.classList.add('ciq-show');
  }
  function handleExpandToggle() {
    if (state.maximized) {
      state.maximized = false;
      ssSet(SS_WIDGET_STATE, 'open');
      applyResponsiveSize();
      els.expand.innerHTML = EXPAND_ICON;
      els.expand.setAttribute('aria-label', 'Expand chat');
    } else {
      state.maximized = true;
      ssSet(SS_WIDGET_STATE, 'maximized');
      applyMaximizedSize();
      els.expand.innerHTML = COMPRESS_ICON;
      els.expand.setAttribute('aria-label', 'Compress chat');
    }
  }
  function applyMaximizedSize() {
    els.window.style.width = '680px';
    els.window.style.height = '85vh';
    els.window.style.bottom = '96px';
    els.window.style.right = '20px';
    els.window.style.top = '';
    els.window.style.left = '';
  }
  var resizeTimer = null;
  function handleResize() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(applyResponsiveSize, 150);
  }
  function applyResponsiveSize() {
    var w = window.innerWidth;
    els.window.style.top = '';
    els.window.style.left = '';
    if (w > 480) {
      els.window.style.width = '420px';
      els.window.style.height = '650px';
      els.window.style.bottom = '96px';
      els.window.style.right = '20px';
      els.window.style.borderRadius = '';
    } else if (w >= 380) {
      els.window.style.width = 'calc(100vw - 32px)';
      els.window.style.height = '580px';
      els.window.style.bottom = '96px';
      els.window.style.right = '20px';
      els.window.style.borderRadius = '';
    } else {
      els.window.style.width = '100vw';
      els.window.style.height = '100vh';
      els.window.style.bottom = '0';
      els.window.style.right = '0';
      els.window.style.borderRadius = '0';
    }
  }
  function handleRefresh() {
    els.messages.textContent = '';
    state.messages = [];
    state.conversationId = null;
    state.started = false;
    state.showSuggestions = true;
    state.leadCardIndex = -1;
    state.leadSequenceActive = false;
    updateInputLock(false);
    startConversation();
  }
  function scrollToBottom() {
    els.messages.scrollTop = els.messages.scrollHeight;
  }
  function formatTime(date) {
    var hours = date.getHours();
    var minutes = date.getMinutes();
    var period = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;
    var minuteStr = minutes < 10 ? '0' + minutes : String(minutes);
    return hours + ':' + minuteStr + ' ' + period;
  }
  function addMessage(role, text) {
    var bubble = document.createElement('div');
    bubble.className = role === 'user' ? 'ciq-msg-user' : 'ciq-msg-bot';
    var textEl = document.createElement('div');
    textEl.className = 'ciq-msg-text';
    textEl.textContent = text;
    var timeEl = document.createElement('div');
    timeEl.className = 'ciq-msg-time';
    timeEl.textContent = formatTime(new Date());
    bubble.appendChild(textEl);
    bubble.appendChild(timeEl);
    els.messages.appendChild(bubble);
    scrollToBottom();
    if (role === 'bot' && !state.isOpen) {
      state.unreadCount++;
      updateBubbleBadge();
    }
    return bubble;
  }
  function addTypingIndicator() {
    var wrap = document.createElement('div');
    wrap.className = 'ciq-typing';
    wrap.id = 'ciq-typing-indicator';
    wrap.innerHTML = '<span></span><span></span><span></span>';
    els.messages.appendChild(wrap);
    scrollToBottom();
    return wrap;
  }
  function removeTypingIndicator() {
    var indicator = shadowRoot.getElementById('ciq-typing-indicator');
    if (indicator && indicator.parentNode) {
      indicator.parentNode.removeChild(indicator);
    }
  }
  function startConversation() {
    fetch(BACKEND_URL + '/api/chat/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botId: botId, sourceUrl: window.location.href })
    })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (!json || !json.success || !json.data) throw new Error('start failed');
        state.conversationId = json.data.conversationId;
        ssSet(SS_CONV_ID, state.conversationId);
        var greeting = json.data.greeting || state.botConfig.greetingMessage || '';
        state.messages.push({ role: 'bot', text: greeting });
        addMessage('bot', greeting);
        renderSuggestions();
      })
      .catch(function () {
        addMessage('bot', 'Something went wrong. Please try again.');
      });
  }
  function handleSend() {
    var text = (els.input.value || '').trim();
    if (!text || state.isLoading || !state.conversationId || els.input.disabled) return;
    els.input.value = '';
    state.showSuggestions = false;
    renderSuggestions();
    state.messages.push({ role: 'user', text: text });
    addMessage('user', text);
    sendMessage(text);
  }
  function sendMessage(text) {
    state.isLoading = true;
    addTypingIndicator();
    var botBubble = addMessage('bot', '');
    var textNode = botBubble.querySelector('.ciq-msg-text');
    var accumulated = '';
    fetch(BACKEND_URL + '/api/chat/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botId: botId, conversationId: state.conversationId, message: text })
    })
      .then(function (res) {
        if (!res.ok || !res.body) throw new Error('bad response');
        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        function read() {
          return reader.read().then(function (result) {
            if (result.done) {
              removeTypingIndicator();
              state.isLoading = false;
              state.messages.push({ role: 'bot', text: accumulated });
              checkLeadTrigger();
              return;
            }
            accumulated += decoder.decode(result.value, { stream: true });
            textNode.textContent = accumulated;
            scrollToBottom();
            return read();
          });
        }
        return read();
      })
      .catch(function () {
        removeTypingIndicator();
        state.isLoading = false;
        if (botBubble.parentNode) {
          botBubble.parentNode.removeChild(botBubble);
        }
        addMessage('bot', 'Something went wrong. Please try again.');
      });
  }
  function checkLeadTrigger() {
    if (state.leadCaptured || state.leadSequenceDone || state.leadSequenceActive || !state.leadFields.length) return;
    fetch(BACKEND_URL + '/api/chat/lead-trigger/' + encodeURIComponent(botId) + '/' + encodeURIComponent(state.conversationId))
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (json && json.success && json.data && json.data.shouldCapture) {
          startLeadSequence();
        }
      })
      .catch(function () {
        /* ignore, not critical to the conversation */
      });
  }
  function buildTranscript() {
    return state.messages
      .map(function (m) {
        return (m.role === 'user' ? 'User: ' : 'Bot: ') + m.text;
      })
      .join('\n');
  }
  function updateInputLock(locked) {
    els.input.disabled = locked;
    els.send.disabled = locked;
    if (locked) {
      els.inputHint.classList.remove('ciq-hidden');
    } else {
      els.inputHint.classList.add('ciq-hidden');
    }
  }
  function validateFieldValue(field, value) {
    var v = (value || '').trim();
    if (!v) return false;
    if (field.type === 'email') return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
    if (field.type === 'phone') return /^\+?[0-9]{10,}$/.test(v);
    if (field.fieldId === 'name') return /^[a-zA-Z\s]{2,}$/.test(v);
    if (field.type === 'select') return !!(field.options && field.options.indexOf(v) !== -1);
    return v.length >= 1;
  }
  function persistLeadValues() {
    ssSet(SS_LEAD_DATA, JSON.stringify({ values: state.leadValues, done: state.leadSequenceDone }));
  }
  function startLeadSequence() {
    state.leadSequenceActive = true;
    state.leadCardIndex = 0;
    renderLeadCard();
  }
  function finalizeCardUI(refs) {
    refs.input.disabled = true;
    refs.submit.disabled = true;
    if (refs.skip && refs.skip.parentNode) {
      refs.skip.parentNode.removeChild(refs.skip);
    }
  }
  function advanceLeadSequence() {
    state.leadCardIndex++;
    renderLeadCard();
  }
  function renderLeadCard() {
    if (state.leadCardIndex >= state.leadFields.length) {
      state.leadSequenceActive = false;
      state.leadSequenceDone = true;
      persistLeadValues();
      updateInputLock(false);
      postLeadIfNeeded();
      return;
    }
    var field = state.leadFields[state.leadCardIndex];
    var required = field.required === true;
    updateInputLock(required);
    var bubble = document.createElement('div');
    bubble.className = 'ciq-msg-bot ciq-lead-card';
    var refs = {};
    var label = document.createElement('div');
    label.className = 'ciq-lead-card-label';
    label.textContent = field.label || '';
    bubble.appendChild(label);
    var row = document.createElement('div');
    row.className = 'ciq-lead-card-row';
    var inputEl;
    if (field.type === 'select' && field.options && field.options.length) {
      inputEl = document.createElement('select');
      inputEl.className = 'ciq-lead-card-input';
      var placeholderOpt = document.createElement('option');
      placeholderOpt.value = '';
      placeholderOpt.textContent = 'Select...';
      inputEl.appendChild(placeholderOpt);
      field.options.forEach(function (opt) {
        var o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        inputEl.appendChild(o);
      });
    } else {
      inputEl = document.createElement('input');
      inputEl.className = 'ciq-lead-card-input';
      inputEl.type = field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text';
      inputEl.placeholder = field.label || '';
    }
    var submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'ciq-lead-card-submit';
    submitBtn.disabled = true;
    submitBtn.setAttribute('aria-label', 'Submit');
    submitBtn.textContent = '→';
    refs.input = inputEl;
    refs.submit = submitBtn;
    var validate = function () {
      submitBtn.disabled = !validateFieldValue(field, inputEl.value);
    };
    inputEl.addEventListener('keyup', validate);
    inputEl.addEventListener('change', validate);
    submitBtn.addEventListener('click', function () {
      if (!validateFieldValue(field, inputEl.value)) return;
      state.leadValues[field.fieldId] = inputEl.value.trim();
      persistLeadValues();
      finalizeCardUI(refs);
      advanceLeadSequence();
    });
    row.appendChild(inputEl);
    row.appendChild(submitBtn);
    bubble.appendChild(row);
    if (!required) {
      var skipBtn = document.createElement('button');
      skipBtn.type = 'button';
      skipBtn.className = 'ciq-lead-card-skip';
      skipBtn.setAttribute('aria-label', 'Skip');
      skipBtn.textContent = '×';
      refs.skip = skipBtn;
      skipBtn.addEventListener('click', function () {
        var v = inputEl.value.trim();
        state.leadValues[field.fieldId] = validateFieldValue(field, v) ? v : null;
        persistLeadValues();
        finalizeCardUI(refs);
        advanceLeadSequence();
      });
      bubble.appendChild(skipBtn);
    }
    els.messages.appendChild(bubble);
    scrollToBottom();
  }
  function postLeadIfNeeded() {
    var payload = {};
    var hasValue = false;
    Object.keys(state.leadValues).forEach(function (k) {
      var v = state.leadValues[k];
      if (v !== null && v !== undefined && v !== '') {
        payload[k] = v;
        hasValue = true;
      }
    });
    if (!hasValue) return;
    payload.botId = botId;
    payload.conversationId = state.conversationId;
    payload.chatTranscript = buildTranscript();
    payload.sourceUrl = window.location.href;
    fetch(BACKEND_URL + '/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (!json || !json.success) throw new Error('lead submit failed');
        state.leadCaptured = true;
        ssSet(SS_LEAD_CAPTURED, 'true');
        addMessage('bot', "Thanks! We'll be in touch.");
      })
      .catch(function () {
        /* silent fail, never surface an error for lead capture */
      });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
