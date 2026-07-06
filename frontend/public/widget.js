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
    started: false
  };
  var shadowRoot = null;
  var els = {};
  var CSS_TEMPLATE =
    ':host{all:initial;--brand:__BRAND__}' +
    '*{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif}' +
    '.ciq-hidden{display:none!important}' +
    '#ciq-bubble{position:fixed;bottom:24px;right:24px;width:56px;height:56px;border-radius:50%;' +
    'background:var(--brand);box-shadow:0 4px 12px rgba(0,0,0,.15);z-index:999999;cursor:pointer;' +
    'border:none;transition:transform .2s ease;display:flex;align-items:center;justify-content:center;padding:0}' +
    '#ciq-bubble:hover{transform:scale(1.05)}' +
    '#ciq-window{position:fixed;bottom:90px;right:24px;width:360px;height:520px;background:#fff;' +
    'border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.12);z-index:999998;display:flex;' +
    'flex-direction:column;overflow:hidden;transition:transform .2s ease,opacity .2s ease}' +
    '#ciq-header{background:var(--brand);color:#fff;padding:16px;display:flex;align-items:center;' +
    'justify-content:space-between;font-weight:500;font-size:15px}' +
    '#ciq-close{background:transparent;border:none;color:#fff;cursor:pointer;font-size:16px}' +
    '#ciq-messages{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px}' +
    '.ciq-msg-bot{background:#f3f4f6;color:#111827;align-self:flex-start;padding:10px 14px;' +
    'border-radius:4px 14px 14px 14px;max-width:80%;font-size:14px;line-height:1.5;' +
    'white-space:pre-wrap;word-break:break-word}' +
    '.ciq-msg-user{background:var(--brand);color:#fff;align-self:flex-end;padding:10px 14px;' +
    'border-radius:14px 4px 14px 14px;max-width:80%;font-size:14px;line-height:1.5;' +
    'white-space:pre-wrap;word-break:break-word}' +
    '.ciq-typing{background:#f3f4f6;align-self:flex-start;padding:12px 14px;' +
    'border-radius:4px 14px 14px 14px;display:flex;gap:4px}' +
    '.ciq-typing span{display:inline-block;width:6px;height:6px;border-radius:50%;' +
    'background:#9ca3af;animation:ciq-bounce 1.2s infinite}' +
    '.ciq-typing span:nth-child(2){animation-delay:.2s}' +
    '.ciq-typing span:nth-child(3){animation-delay:.4s}' +
    '@keyframes ciq-bounce{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-4px);opacity:1}}' +
    '#ciq-input-area{display:flex;padding:12px;gap:8px;border-top:1px solid #e5e7eb}' +
    '#ciq-input{flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:8px 12px;font-size:14px;outline:none}' +
    '#ciq-input:focus{border-color:var(--brand)}' +
    '#ciq-send{width:36px;height:36px;background:var(--brand);border-radius:8px;border:none;' +
    'cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}' +
    '#ciq-send:disabled{opacity:.6;cursor:default}' +
    '#ciq-lead-form{padding:16px;background:#f9fafb;border-top:1px solid #e5e7eb}' +
    '#ciq-lead-form p{font-size:13px;color:#374151;margin:0 0 10px 0}' +
    '#ciq-lead-form input{width:100%;margin-bottom:8px;padding:8px 10px;border:1px solid #e5e7eb;' +
    'border-radius:6px;font-size:13px;outline:none}' +
    '#ciq-lead-form input:focus{border-color:var(--brand)}' +
    '#ciq-lead-submit{width:100%;padding:10px;background:var(--brand);color:#fff;border:none;' +
    'border-radius:8px;cursor:pointer;font-size:14px;font-weight:500;margin-top:4px}' +
    '#ciq-lead-error{color:#ef4444;font-size:12px;margin-top:8px}' +
    '@media (max-width:480px){#ciq-window{width:calc(100vw - 24px);right:12px;bottom:80px}' +
    '#ciq-bubble{bottom:12px;right:12px}}';
  var BUBBLE_ICON =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="white"/></svg>';
  var SEND_ICON =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<line x1="22" y1="2" x2="11" y2="13" stroke="white" stroke-width="2"/>' +
    '<polygon points="22 2 15 22 11 13 2 9 22 2" fill="white"/></svg>';
  var SHELL_HTML =
    '<button id="ciq-bubble" aria-label="Open chat">' + BUBBLE_ICON + '</button>' +
    '<div id="ciq-window" class="ciq-hidden">' +
    '<div id="ciq-header"><div id="ciq-bot-name"></div>' +
    '<button id="ciq-close" aria-label="Close chat">✕</button></div>' +
    '<div id="ciq-messages"></div>' +
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
      els.botName = shadowRoot.getElementById('ciq-bot-name');
      els.close = shadowRoot.getElementById('ciq-close');
      els.messages = shadowRoot.getElementById('ciq-messages');
      els.leadForm = shadowRoot.getElementById('ciq-lead-form');
      els.leadError = shadowRoot.getElementById('ciq-lead-error');
      els.leadSubmit = shadowRoot.getElementById('ciq-lead-submit');
      els.input = shadowRoot.getElementById('ciq-input');
      els.send = shadowRoot.getElementById('ciq-send');
      els.botName.textContent = state.botConfig.name || '';
      els.bubble.classList.add('ciq-hidden');
      bindEvents();
      applyTrigger();
    } catch (e) {
      /* never break the host site */
    }
  }
  function showBubble() {
    if (els.bubble) els.bubble.classList.remove('ciq-hidden');
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
    els.window.classList.remove('ciq-hidden');
    if (!state.started) {
      state.started = true;
      startConversation();
    }
  }
  function closeChat() {
    state.isOpen = false;
    els.window.classList.add('ciq-hidden');
  }
  function scrollToBottom() {
    els.messages.scrollTop = els.messages.scrollHeight;
  }
  function addMessage(role, text) {
    var bubble = document.createElement('div');
    bubble.className = role === 'user' ? 'ciq-msg-user' : 'ciq-msg-bot';
    bubble.textContent = text;
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
      })
      .catch(function () {
        addMessage('bot', 'Something went wrong. Please try again.');
      });
  }
  function handleSend() {
    var text = (els.input.value || '').trim();
    if (!text || state.isLoading || !state.conversationId) return;
    els.input.value = '';
    state.messages.push({ role: 'user', text: text });
    addMessage('user', text);
    sendMessage(text);
  }
  function sendMessage(text) {
    state.isLoading = true;
    addTypingIndicator();
    var botBubble = addMessage('bot', '');
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
            botBubble.textContent = accumulated;
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
