(function () {
  'use strict';
  var BACKEND_URL = '__BACKEND_URL__';
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
    showSuggestions: true
  };
  var shadowRoot = null;
  var els = {};
  var CSS_TEMPLATE =
    "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');" +
    ':host{all:initial;--brand:__BRAND__}' +
    '*{box-sizing:border-box;font-family:"Inter",Arial,sans-serif;margin:0;padding:0}' +
    '.ciq-hidden{display:none!important}' +
    '#ciq-bubble{position:fixed;bottom:24px;right:24px;width:56px;height:56px;border-radius:50%;' +
    'background:linear-gradient(135deg,#6366f1,#4f46e5);box-shadow:0 8px 32px rgba(99,102,241,.35);' +
    'z-index:999999;cursor:pointer;border:none;display:flex;align-items:center;justify-content:center;padding:0;' +
    'transition:transform .2s cubic-bezier(0.34,1.56,0.64,1)}' +
    '#ciq-bubble:hover{transform:scale(1.08)}' +
    '#ciq-bubble:active{transform:scale(.95)}' +
    '.ciq-ping{position:absolute;top:-2px;right:-2px;width:14px;height:14px;display:flex}' +
    '.ciq-ping-outer{position:absolute;display:inline-flex;height:100%;width:100%;border-radius:50%;' +
    'background:#eab308;opacity:.75;animation:ciq-ping 1.4s cubic-bezier(0,0,.2,1) infinite}' +
    '.ciq-ping-inner{position:relative;display:inline-flex;height:14px;width:14px;border-radius:50%;background:#ca8a04}' +
    '@keyframes ciq-ping{75%,100%{transform:scale(2);opacity:0}}' +
    '#ciq-bubble.ciq-open .ciq-ping{display:none}' +
    '#ciq-window{position:fixed;bottom:90px;right:24px;width:360px;height:500px;background:#fff;' +
    'border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.15);border:1px solid #e5e7eb;z-index:999998;' +
    'display:flex;flex-direction:column;overflow:hidden;transform-origin:bottom right;transform:scale(.85);' +
    'opacity:0;pointer-events:none;transition:transform .35s cubic-bezier(0.34,1.56,0.64,1),opacity .25s ease}' +
    '#ciq-window.ciq-open{transform:scale(1);opacity:1;pointer-events:auto}' +
    '#ciq-header{background:var(--brand);padding:16px;display:flex;align-items:center;gap:12px}' +
    '#ciq-avatar-wrap{position:relative;flex-shrink:0;width:40px;height:40px}' +
    '#ciq-avatar{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.1);' +
    'border:1.5px solid rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;' +
    'font-weight:700;font-size:14px;color:#fff}' +
    '#ciq-online-dot{position:absolute;bottom:0;right:0;width:12px;height:12px;background:#4ade80;' +
    'border:2px solid var(--brand);border-radius:50%}' +
    '#ciq-header-info{flex:1;min-width:0}' +
    '#ciq-bot-name{font-weight:700;font-size:13px;color:#fff;display:flex;align-items:center;gap:4px;' +
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#ciq-subtitle{font-size:11px;color:rgba(255,255,255,.8);margin-top:2px}' +
    '#ciq-close{flex-shrink:0;width:28px;height:28px;background:transparent;border:none;' +
    'color:rgba(255,255,255,.8);cursor:pointer;font-size:14px;border-radius:50%;' +
    'display:flex;align-items:center;justify-content:center;transition:background .15s,color .15s}' +
    '#ciq-close:hover{background:rgba(255,255,255,.1);color:#fff}' +
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
    '#ciq-lead-form{padding:16px;background:#f9fafb;border-top:1px solid #e5e7eb}' +
    '#ciq-lead-form p{font-size:13px;color:#374151;margin:0 0 10px 0}' +
    '#ciq-lead-form input{width:100%;padding:8px 12px;border:1px solid #e5e7eb;border-radius:10px;' +
    'font-size:13px;outline:none;margin-bottom:8px}' +
    '#ciq-lead-form input:focus{border-color:var(--brand)}' +
    '#ciq-lead-submit{width:100%;padding:10px;background:linear-gradient(135deg,#6366f1,#4f46e5);' +
    'color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;' +
    'transition:opacity .15s}' +
    '#ciq-lead-submit:hover{opacity:.92}' +
    '#ciq-lead-error{color:#ef4444;font-size:12px;margin-top:8px}' +
    '#ciq-input-area{display:flex;padding:12px;gap:8px;background:#fff;border-top:1px solid #e5e7eb}' +
    '#ciq-input{flex:1;padding:10px 16px;border:1px solid #e5e7eb;border-radius:12px;font-size:14px;' +
    'background:#f9fafb;outline:none}' +
    '#ciq-input:focus{border-color:var(--brand)}' +
    '#ciq-input::placeholder{color:#6b7280}' +
    '#ciq-send{width:40px;height:40px;background:linear-gradient(135deg,#6366f1,#4f46e5);border:none;' +
    'border-radius:12px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;' +
    'transition:opacity .15s}' +
    '#ciq-send:hover{opacity:.9}' +
    '#ciq-send:disabled{opacity:.4;cursor:default}' +
    '@media (max-width:480px){#ciq-window{width:calc(100vw - 24px);right:12px}' +
    '#ciq-bubble{bottom:12px;right:12px}}' +
    '#ciq-suggestions{display:flex;flex-wrap:wrap;gap:8px;padding:0 16px 12px 16px}' +
    '.ciq-chip{display:flex;align-items:center;gap:6px;padding:8px 12px;background:#fff;' +
    'border:1px solid #e5e7eb;border-radius:999px;font-size:13px;color:#111827;cursor:pointer;' +
    'transition:background .2s,border-color .2s,color .2s;box-shadow:0 1px 2px rgba(0,0,0,.04)}' +
    '.ciq-chip:hover{background:#f9fafb;border-color:var(--brand);color:var(--brand)}' +
    '.ciq-chip-text{font-weight:500}';
  var BUBBLE_ICON =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="white"/></svg>';
  var SEND_ICON =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<line x1="22" y1="2" x2="11" y2="13" stroke="white" stroke-width="2"/>' +
    '<polygon points="22 2 15 22 11 13 2 9 22 2" fill="white"/></svg>';
  var SPARKLES_ICON =
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M12 2l1.5 6.5L20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5L12 2z" fill="#fde047"/></svg>';
  var SHELL_HTML =
    '<button id="ciq-bubble" aria-label="Open chat">' + BUBBLE_ICON +
    '<span class="ciq-ping"><span class="ciq-ping-outer"></span><span class="ciq-ping-inner"></span></span>' +
    '</button>' +
    '<div id="ciq-window">' +
    '<div id="ciq-header">' +
    '<div id="ciq-avatar-wrap"><div id="ciq-avatar"></div><span id="ciq-online-dot"></span></div>' +
    '<div id="ciq-header-info">' +
    '<div id="ciq-bot-name"><span id="ciq-bot-name-text"></span>' + SPARKLES_ICON + '</div>' +
    '<div id="ciq-subtitle">Powered by BeepBoop</div>' +
    '</div>' +
    '<button id="ciq-close" aria-label="Close chat">✕</button>' +
    '</div>' +
    '<div id="ciq-messages"></div>' +
    '<div id="ciq-suggestions"></div>' +
    '<div id="ciq-lead-form" class="ciq-hidden">' +
    '<p>Please share your details and we\'ll be in touch.</p>' +
    '<input id="ciq-lead-name" type="text" placeholder="Your Name" required />' +
    '<input id="ciq-lead-phone" type="tel" placeholder="Phone Number" required />' +
    '<input id="ciq-lead-email" type="email" placeholder="Email Address" required />' +
    '<input id="ciq-lead-property" type="text" placeholder="Property Interest (optional)" />' +
    '<input id="ciq-lead-budget" type="text" placeholder="Budget Range (optional)" />' +
    '<button id="ciq-lead-submit">Send</button>' +
    '<div id="ciq-lead-error" class="ciq-hidden"></div></div>' +
    '<div id="ciq-input-area">' +
    '<input id="ciq-input" type="text" placeholder="Type a message..." />' +
    '<button id="ciq-send" aria-label="Send message">' + SEND_ICON + '</button></div></div>';
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
      els.window = shadowRoot.getElementById('ciq-window');
      els.avatar = shadowRoot.getElementById('ciq-avatar');
      els.botName = shadowRoot.getElementById('ciq-bot-name-text');
      els.close = shadowRoot.getElementById('ciq-close');
      els.messages = shadowRoot.getElementById('ciq-messages');
      els.suggestions = shadowRoot.getElementById('ciq-suggestions');
      els.leadForm = shadowRoot.getElementById('ciq-lead-form');
      els.leadError = shadowRoot.getElementById('ciq-lead-error');
      els.leadSubmit = shadowRoot.getElementById('ciq-lead-submit');
      els.input = shadowRoot.getElementById('ciq-input');
      els.send = shadowRoot.getElementById('ciq-send');
      var botName = state.botConfig.name || '';
      els.botName.textContent = botName;
      els.avatar.textContent = (botName || 'AI').trim().substring(0, 2).toUpperCase();
      els.bubble.classList.add('ciq-hidden');
      pickSuggestions();
      bindEvents();
      applyTrigger();
    } catch (e) {
      /* never break the host site */
    }
  }
  function showBubble() {
    if (els.bubble) els.bubble.classList.remove('ciq-hidden');
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
    els.bubble.addEventListener('click', openChat);
    els.close.addEventListener('click', closeChat);
    els.send.addEventListener('click', handleSend);
    els.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') handleSend();
    });
    els.leadSubmit.addEventListener('click', handleLeadSubmit);
  }
  function openChat() {
    state.isOpen = true;
    els.window.classList.add('ciq-open');
    els.bubble.classList.add('ciq-open');
    if (!state.started) {
      state.started = true;
      startConversation();
    }
  }
  function closeChat() {
    state.isOpen = false;
    els.window.classList.remove('ciq-open');
    els.bubble.classList.remove('ciq-open');
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
    if (!text || state.isLoading || !state.conversationId) return;
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
    if (state.leadCaptured) return;
    fetch(BACKEND_URL + '/api/chat/lead-trigger/' + encodeURIComponent(botId) + '/' + encodeURIComponent(state.conversationId))
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (json && json.success && json.data && json.data.shouldCapture) {
          els.leadForm.classList.remove('ciq-hidden');
          scrollToBottom();
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
  function handleLeadSubmit() {
    var name = shadowRoot.getElementById('ciq-lead-name').value.trim();
    var phone = shadowRoot.getElementById('ciq-lead-phone').value.trim();
    var email = shadowRoot.getElementById('ciq-lead-email').value.trim();
    var propertyInterest = shadowRoot.getElementById('ciq-lead-property').value.trim();
    var budgetRange = shadowRoot.getElementById('ciq-lead-budget').value.trim();
    els.leadError.classList.add('ciq-hidden');
    if (!name || !phone || !email) {
      els.leadError.textContent = 'Please fill in your name, phone, and email.';
      els.leadError.classList.remove('ciq-hidden');
      return;
    }
    els.leadSubmit.disabled = true;
    fetch(BACKEND_URL + '/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        botId: botId,
        conversationId: state.conversationId,
        name: name,
        phone: phone,
        email: email,
        propertyInterest: propertyInterest || undefined,
        budgetRange: budgetRange || undefined,
        chatTranscript: buildTranscript(),
        sourceUrl: window.location.href
      })
    })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        els.leadSubmit.disabled = false;
        if (!json || !json.success) throw new Error('lead submit failed');
        state.leadCaptured = true;
        els.leadForm.classList.add('ciq-hidden');
        addMessage('bot', 'Thanks! Our team will be in touch shortly.');
      })
      .catch(function () {
        els.leadSubmit.disabled = false;
        els.leadError.textContent = 'Something went wrong. Please try again.';
        els.leadError.classList.remove('ciq-hidden');
      });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
