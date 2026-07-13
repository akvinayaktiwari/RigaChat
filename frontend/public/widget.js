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
    isMaximized: false,
    conversationId: null,
    messages: [],
    isLoading: false,
    leadCaptured: false,
    botConfig: null,
    started: false,
    suggestions: [],
    showSuggestions: true,
    isCollectingLead: false,
    currentLeadStep: null,
    collectedName: '',
    collectedPhone: '',
    collectedEmail: ''
  };
  var shadowRoot = null;
  var els = {};
  var CSS_TEMPLATE =
    "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');" +
    ':host{all:initial;--brand:__BRAND__}' +
    '*{box-sizing:border-box;font-family:"Inter",Arial,sans-serif;margin:0;padding:0}' +
    '.ciq-hidden{display:none!important}' +
    '#ciq-bubble{position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;' +
    'background:var(--brand);box-shadow:0 8px 32px rgba(0,0,0,.18);' +
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
    '#ciq-window{position:fixed;bottom:20px;right:20px;width:380px;height:560px;background:#fff;' +
    'border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.18);z-index:999998;' +
    'display:flex;flex-direction:column;overflow:hidden;transform-origin:bottom right;' +
    'transform:scale(.95) translateY(8px);opacity:0;pointer-events:none;' +
    'transition:width .25s ease,height .25s ease,transform .2s ease-out,opacity .2s ease-out}' +
    '#ciq-window.ciq-open{transform:scale(1) translateY(0);opacity:1;pointer-events:auto}' +
    '#ciq-window.ciq-maximized{width:440px;height:680px}' +
    '@media (max-width:480px){' +
    '#ciq-window{width:100vw;height:85vh;bottom:0;right:0;border-radius:16px 16px 0 0}' +
    '#ciq-window.ciq-maximized{width:100vw;height:95vh;bottom:0;right:0;border-radius:16px 16px 0 0}' +
    '#ciq-bubble{bottom:16px;right:16px}}' +
    '#ciq-header{background:var(--brand);padding:12px 12px 12px 14px;display:flex;align-items:center;' +
    'justify-content:space-between;border-radius:16px 16px 0 0;flex-shrink:0}' +
    '#ciq-header-left{display:flex;align-items:center;gap:10px;min-width:0}' +
    '#ciq-avatar-wrap{position:relative;flex-shrink:0;width:40px;height:40px}' +
    '#ciq-avatar{width:40px;height:40px;border-radius:50%;background:var(--brand);' +
    'border:1.5px solid rgba(255,255,255,.35);display:flex;align-items:center;justify-content:center;' +
    'font-weight:700;font-size:14px;color:#fff}' +
    '#ciq-online-dot{position:absolute;bottom:0;right:0;width:8px;height:8px;background:#22c55e;' +
    'border:2px solid var(--brand);border-radius:50%}' +
    '#ciq-header-info{min-width:0}' +
    '#ciq-bot-name{font-weight:600;font-size:15px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#ciq-subtitle{font-size:12px;color:rgba(255,255,255,.75);margin-top:1px}' +
    '#ciq-toolbar{display:flex;align-items:center;gap:2px;flex-shrink:0}' +
    '.ciq-tool-btn{width:28px;height:28px;border-radius:6px;background:transparent;border:none;' +
    'color:rgba(255,255,255,.85);cursor:pointer;font-size:16px;display:flex;align-items:center;' +
    'justify-content:center;transition:background .15s}' +
    '.ciq-tool-btn:hover{background:rgba(255,255,255,.15)}' +
    '#ciq-messages{flex:1;overflow-y:auto;padding:12px 12px 8px 12px;display:flex;flex-direction:column;' +
    'scroll-behavior:smooth}' +
    '#ciq-messages::-webkit-scrollbar{width:4px}' +
    '#ciq-messages::-webkit-scrollbar-track{background:transparent}' +
    '#ciq-messages::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15);border-radius:2px}' +
    '@keyframes ciq-msg-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}' +
    '.ciq-msg-bot{background:#f3f4f6;color:#111827;align-self:flex-start;border-radius:16px 16px 16px 4px;' +
    'padding:10px 13px;font-size:14px;line-height:1.5;max-width:85%;margin:2px 0 2px 8px;' +
    'animation:ciq-msg-in .15s ease-out}' +
    '.ciq-msg-user{background:var(--brand);color:#fff;align-self:flex-end;border-radius:16px 16px 4px 16px;' +
    'padding:10px 13px;font-size:14px;line-height:1.5;max-width:85%;margin:2px 8px 2px auto;text-align:left;' +
    'animation:ciq-msg-in .15s ease-out}' +
    '.ciq-msg-text{white-space:pre-wrap;word-break:break-word}' +
    '.ciq-msg-time{font-size:11px;color:#9ca3af;margin:2px 8px}' +
    '.ciq-typing{background:#f3f4f6;align-self:flex-start;padding:12px 14px;border-radius:16px 16px 16px 4px;' +
    'display:flex;gap:4px;margin:2px 0 2px 8px}' +
    '.ciq-typing span{display:inline-block;width:6px;height:6px;border-radius:50%;background:#9ca3af;' +
    'animation:ciq-pulse 1.2s infinite}' +
    '.ciq-typing span:nth-child(2){animation-delay:.2s}' +
    '.ciq-typing span:nth-child(3){animation-delay:.4s}' +
    '@keyframes ciq-pulse{0%,100%{opacity:.4}50%{opacity:1}}' +
    '.ciq-inline-input-wrap{background:#f3f4f6;border-radius:12px 12px 12px 4px;padding:10px 12px;' +
    'margin:4px 0 4px 8px;display:flex;align-items:center;gap:8px;max-width:85%;align-self:flex-start;' +
    'animation:ciq-msg-in .15s ease-out}' +
    '.ciq-inline-input{border:none;background:#fff;border-radius:8px;padding:8px 10px;font-size:14px;' +
    'flex:1;outline:none;box-shadow:0 1px 3px rgba(0,0,0,.1)}' +
    '.ciq-inline-submit{width:32px;height:32px;border-radius:8px;background:var(--brand);border:none;' +
    'color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0}' +
    '.ciq-inline-skip{display:block;margin:2px 0 4px 8px;color:#6b7280;font-size:12px;cursor:pointer;' +
    'background:none;border:none;padding:0;text-align:left}' +
    '#ciq-suggestions{display:flex;flex-wrap:wrap;gap:6px;padding:4px 8px 8px 8px}' +
    '.ciq-chip{display:inline-block;padding:8px 14px;background:#fff;border:1px solid #e5e7eb;' +
    'border-radius:20px;font-size:13px;color:#374151;cursor:pointer;transition:all .15s;margin:3px 3px}' +
    '.ciq-chip:hover{border-color:var(--brand);color:var(--brand)}' +
    '#ciq-input-area{display:flex;align-items:center;padding:10px 12px;border-top:1px solid #f3f4f6;' +
    'gap:8px;background:#fff;flex-shrink:0}' +
    '#ciq-input{flex:1;border:1px solid #e5e7eb;border-radius:22px;padding:9px 14px;font-size:14px;' +
    'outline:none;resize:none;background:#f9fafb;color:#111827;transition:border-color .15s;' +
    'max-height:100px;overflow-y:auto}' +
    '#ciq-input:focus{border-color:var(--brand)}' +
    '#ciq-input::placeholder{color:#9ca3af}' +
    '#ciq-input-area.ciq-disabled #ciq-input{pointer-events:none;opacity:.5}' +
    '#ciq-send{width:36px;height:36px;border-radius:50%;background:var(--brand);border:none;color:#fff;' +
    'cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;' +
    'transition:opacity .15s;font-size:16px}' +
    '#ciq-send:hover{opacity:.85}' +
    '#ciq-send:disabled{opacity:.4;cursor:not-allowed}' +
    '#ciq-powered{font-size:11px;color:#9ca3af;text-align:center;padding:4px 0 6px;background:#fff;' +
    'border-radius:0 0 16px 16px;flex-shrink:0}';
  var BUBBLE_ICON =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" fill="white"/></svg>';
  var ARROW_RIGHT_ICON =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<line x1="5" y1="12" x2="19" y2="12" stroke="white" stroke-width="2"/>' +
    '<polyline points="12 5 19 12 12 19" fill="none" stroke="white" stroke-width="2"/></svg>';
  var SEND_ICON =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<line x1="22" y1="2" x2="11" y2="13" stroke="white" stroke-width="2"/>' +
    '<polygon points="22 2 15 22 11 13 2 9 22 2" fill="white"/></svg>';
  var SHELL_HTML =
    '<button id="ciq-bubble" aria-label="Open chat">' + BUBBLE_ICON +
    '<span class="ciq-ping"><span class="ciq-ping-outer"></span><span class="ciq-ping-inner"></span></span>' +
    '</button>' +
    '<div id="ciq-window">' +
    '<div id="ciq-header">' +
    '<div id="ciq-header-left">' +
    '<div id="ciq-avatar-wrap"><div id="ciq-avatar"></div><span id="ciq-online-dot"></span></div>' +
    '<div id="ciq-header-info">' +
    '<div id="ciq-bot-name"></div>' +
    '<div id="ciq-subtitle">AI Assistant</div>' +
    '</div></div>' +
    '<div id="ciq-toolbar">' +
    '<button class="ciq-tool-btn" id="ciq-restart" aria-label="Restart conversation" title="Restart"><i class="ti ti-refresh"></i></button>' +
    '<button class="ciq-tool-btn" id="ciq-maximize" aria-label="Maximize chat" title="Maximize"><i class="ti ti-arrows-maximize"></i></button>' +
    '<button class="ciq-tool-btn" id="ciq-close" aria-label="Close chat" title="Close"><i class="ti ti-x"></i></button>' +
    '</div>' +
    '</div>' +
    '<div id="ciq-messages"></div>' +
    '<div id="ciq-suggestions"></div>' +
    '<div id="ciq-input-area">' +
    '<input id="ciq-input" type="text" placeholder="Type a message..." />' +
    '<button id="ciq-send" aria-label="Send message"><i class="ti ti-send"></i></button></div>' +
    '<div id="ciq-powered">Powered by BeepBoop</div>' +
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
  function mount() {
    try {
      var host = document.createElement('div');
      host.id = 'chatiq-widget-host';
      document.body.appendChild(host);
      shadowRoot = host.attachShadow({ mode: 'open' });
      var style = document.createElement('style');
      style.textContent = CSS_TEMPLATE.replace(/__BRAND__/g, state.botConfig.brandColor || '#6366f1');
      shadowRoot.appendChild(style);
      var iconLink = document.createElement('link');
      iconLink.rel = 'stylesheet';
      iconLink.href = 'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/tabler-icons.min.css';
      shadowRoot.appendChild(iconLink);
      var container = document.createElement('div');
      container.innerHTML = SHELL_HTML;
      while (container.firstChild) {
        shadowRoot.appendChild(container.firstChild);
      }
      els.bubble = shadowRoot.getElementById('ciq-bubble');
      els.window = shadowRoot.getElementById('ciq-window');
      els.avatar = shadowRoot.getElementById('ciq-avatar');
      els.botName = shadowRoot.getElementById('ciq-bot-name');
      els.close = shadowRoot.getElementById('ciq-close');
      els.restart = shadowRoot.getElementById('ciq-restart');
      els.maximize = shadowRoot.getElementById('ciq-maximize');
      els.maximizeIcon = els.maximize.querySelector('i');
      els.messages = shadowRoot.getElementById('ciq-messages');
      els.suggestions = shadowRoot.getElementById('ciq-suggestions');
      els.inputArea = shadowRoot.getElementById('ciq-input-area');
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
    if (!state.showSuggestions || !state.suggestions.length || state.isCollectingLead) return;
    state.suggestions.forEach(function (s) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'ciq-chip';
      chip.textContent = s.question;
      chip.addEventListener('click', function () {
        handleSuggestionClick(s);
      });
      els.suggestions.appendChild(chip);
    });
  }
  function handleSuggestionClick(s) {
    if (state.isCollectingLead) return;
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
    els.restart.addEventListener('click', restartChat);
    els.maximize.addEventListener('click', toggleMaximize);
    els.send.addEventListener('click', handleSend);
    els.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') handleSend();
    });
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
  function toggleMaximize() {
    state.isMaximized = !state.isMaximized;
    els.window.classList.toggle('ciq-maximized', state.isMaximized);
    if (els.maximizeIcon) {
      els.maximizeIcon.className = state.isMaximized ? 'ti ti-arrows-minimize' : 'ti ti-arrows-maximize';
    }
    els.maximize.title = state.isMaximized ? 'Minimize' : 'Maximize';
  }
  function restartChat() {
    state.messages = [];
    state.conversationId = null;
    state.started = false;
    state.leadCaptured = false;
    state.isCollectingLead = false;
    state.currentLeadStep = null;
    state.collectedName = '';
    state.collectedPhone = '';
    state.collectedEmail = '';
    state.showSuggestions = true;
    els.messages.innerHTML = '';
    els.suggestions.innerHTML = '';
    setInputDisabled(false);
    state.started = true;
    startConversation();
  }
  function setInputDisabled(disabled) {
    els.inputArea.classList.toggle('ciq-disabled', disabled);
    els.input.disabled = disabled;
    els.input.placeholder = disabled ? 'Please answer above to continue...' : 'Type a message...';
    els.send.disabled = disabled;
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
    bubble.appendChild(textEl);
    els.messages.appendChild(bubble);
    var timeEl = document.createElement('div');
    timeEl.className = 'ciq-msg-time';
    timeEl.textContent = formatTime(new Date());
    timeEl.style.alignSelf = role === 'user' ? 'flex-end' : 'flex-start';
    if (role === 'user') {
      timeEl.style.textAlign = 'right';
    }
    els.messages.appendChild(timeEl);
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
    if (state.isCollectingLead) return;
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
    if (state.leadCaptured || state.isCollectingLead) return;
    fetch(BACKEND_URL + '/api/chat/lead-trigger/' + encodeURIComponent(botId) + '/' + encodeURIComponent(state.conversationId))
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (json && json.success && json.data && json.data.shouldCapture) {
          startLeadCollection();
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
  function startLeadCollection() {
    state.isCollectingLead = true;
    state.currentLeadStep = 'name';
    state.showSuggestions = false;
    els.suggestions.innerHTML = '';
    setInputDisabled(true);
    addMessage('bot', "What's your name?");
    addInlineInput({ placeholder: 'Your name', type: 'text' });
  }
  function addInlineInput(opts) {
    var wrap = document.createElement('div');
    wrap.className = 'ciq-inline-input-wrap';
    var input = document.createElement('input');
    input.className = 'ciq-inline-input';
    input.type = opts.type;
    input.placeholder = opts.placeholder;
    var submit = document.createElement('button');
    submit.type = 'button';
    submit.className = 'ciq-inline-submit';
    submit.setAttribute('aria-label', 'Submit');
    submit.innerHTML = '<i class="ti ti-arrow-right"></i>';
    wrap.appendChild(input);
    wrap.appendChild(submit);
    els.messages.appendChild(wrap);
    els.activeInlineWrap = wrap;
    els.activeInlineSkip = null;
    if (opts.showSkip) {
      var skip = document.createElement('button');
      skip.type = 'button';
      skip.className = 'ciq-inline-skip';
      skip.textContent = 'Skip';
      skip.addEventListener('click', handleSkipEmail);
      els.messages.appendChild(skip);
      els.activeInlineSkip = skip;
    }
    submit.addEventListener('click', function () {
      submitInlineValue(input.value);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitInlineValue(input.value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
      }
    });
    scrollToBottom();
    setTimeout(function () { input.focus(); }, 0);
  }
  function removeActiveInline() {
    if (els.activeInlineWrap && els.activeInlineWrap.parentNode) {
      els.activeInlineWrap.parentNode.removeChild(els.activeInlineWrap);
    }
    if (els.activeInlineSkip && els.activeInlineSkip.parentNode) {
      els.activeInlineSkip.parentNode.removeChild(els.activeInlineSkip);
    }
    els.activeInlineWrap = null;
    els.activeInlineSkip = null;
  }
  function submitInlineValue(rawValue) {
    var value = (rawValue || '').trim();
    var step = state.currentLeadStep;
    if ((step === 'name' || step === 'phone') && !value) return;
    removeActiveInline();
    addMessage('user', value);
    advanceLeadStep(value);
  }
  function handleSkipEmail() {
    removeActiveInline();
    state.collectedEmail = '';
    finishLeadCollection();
  }
  function advanceLeadStep(value) {
    if (state.currentLeadStep === 'name') {
      state.collectedName = value;
      state.currentLeadStep = 'phone';
      addMessage('bot', "What's your phone number?");
      addInlineInput({ placeholder: '+91 XXXXX XXXXX', type: 'tel' });
    } else if (state.currentLeadStep === 'phone') {
      state.collectedPhone = value;
      state.currentLeadStep = 'email';
      addMessage('bot', "What's your email address? (optional)");
      addInlineInput({ placeholder: 'your@email.com', type: 'email', showSkip: true });
    } else if (state.currentLeadStep === 'email') {
      state.collectedEmail = value;
      finishLeadCollection();
    }
  }
  function finishLeadCollection() {
    state.currentLeadStep = null;
    submitLeadToApi();
    addMessage(
      'bot',
      'Thanks ' + (state.collectedName || '') + '! Our team will reach out to you shortly. Is there anything else I can help you with?'
    );
    state.isCollectingLead = false;
    setInputDisabled(false);
  }
  function submitLeadToApi() {
    state.leadCaptured = true;
    fetch(BACKEND_URL + '/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        botId: botId,
        conversationId: state.conversationId,
        name: state.collectedName,
        phone: state.collectedPhone,
        email: state.collectedEmail,
        chatTranscript: buildTranscript(),
        sourceUrl: window.location.href
      })
    }).catch(function () {
      /* never break the host site on lead submit failure */
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
