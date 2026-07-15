(function () {
  'use strict';
  try {
    var BACKEND_URL = '__BACKEND_URL__';
    var WS_URL = '__WS_URL__';

    function getAgentId() {
      var scripts = document.getElementsByTagName('script');
      for (var i = 0; i < scripts.length; i++) {
        var src = scripts[i].getAttribute('src') || '';
        if (src.indexOf('voice-widget.js') !== -1) {
          return scripts[i].getAttribute('data-agent-id');
        }
      }
      return null;
    }

    var agentId = getAgentId();
    if (!agentId) {
      if (window.console && console.warn) {
        console.warn('[VyostraAI Voice] Missing data-agent-id on voice-widget.js script tag.');
      }
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
      if (window.console && console.warn) {
        console.warn('[VyostraAI Voice] This browser does not support the required audio APIs.');
      }
      return;
    }

    var LOGO_SVG =
      '<svg width="20" height="20" viewBox="0 0 28 28" fill="none">' +
      '<rect width="28" height="28" rx="8" fill="rgba(255,255,255,0.18)"/>' +
      '<path d="M8 19L14 9L20 19" stroke="white" stroke-width="2.2" ' +
      'stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M10.5 15.5H17.5" stroke="white" stroke-width="1.8" ' +
      'stroke-linecap="round"/>' +
      '</svg>';

    var BAR_COUNT = 20;
    var PING_INTERVAL_MS = 20000;
    var RECORDER_TIMESLICE_MS = 250;

    var CSS_TEMPLATE =
      ':host{all:initial}' +
      '*{box-sizing:border-box;font-family:Arial,Helvetica,sans-serif;margin:0;padding:0}' +
      '.vw-hidden{display:none!important}' +
      '#vw-widget{__POSITION_CSS__;z-index:999999}' +
      '#vw-collapsed{display:flex;align-items:center;gap:8px;background:#7c3aed;color:#fff;' +
      'border:none;border-radius:999px;padding:11px 22px;cursor:pointer;' +
      'box-shadow:0 8px 24px rgba(0,0,0,.2);font-size:14px;font-weight:600;white-space:nowrap}' +
      '#vw-collapsed:hover{filter:brightness(1.05)}' +
      '#vw-expanded{display:flex;align-items:center;gap:10px;background:#7c3aed;' +
      'border-radius:999px;padding:10px 16px;box-shadow:0 8px 24px rgba(0,0,0,.2);min-width:220px}' +
      '#vw-bars{display:flex;align-items:center;gap:2px;flex:1;height:24px}' +
      '.vw-bar{width:3px;border-radius:2px;background:#fff;height:3px;flex-shrink:0}' +
      '#vw-label{color:#fff;font-size:12px;font-weight:600;opacity:.85;white-space:nowrap}' +
      '#vw-error{color:#fff;font-size:11px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '#vw-close{width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,.13);' +
      'border:none;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;' +
      'font-size:14px;line-height:1;flex-shrink:0;padding:0}';

    function getPositionCss(position) {
      if (position === 'bottom-left') {
        return 'position:fixed;bottom:24px;left:24px';
      }
      if (position === 'bottom-center') {
        return 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%)';
      }
      return 'position:fixed;bottom:24px;right:24px';
    }

    var state = {
      config: null,
      shadowRoot: null,
      els: {},
      bars: [],
      expanded: false,
      mediaStream: null,
      audioContext: null,
      analyser: null,
      dataArray: null,
      source: null,
      mediaRecorder: null,
      ws: null,
      pingInterval: null,
      animFrame: null,
      idleTick: 0
    };

    function init() {
      fetch(BACKEND_URL + '/api/voice-agents/public/' + encodeURIComponent(agentId))
        .then(function (res) { return res.json(); })
        .then(function (json) {
          if (!json || !json.success || !json.data) return;
          if (!json.data.isEnabled) return;
          state.config = json.data;
          mount();
        })
        .catch(function () {
          /* exit silently, never break the host site */
        });
    }

    function mount() {
      try {
        var host = document.createElement('div');
        host.id = 'vyostra-voice-widget-host';
        document.body.appendChild(host);
        state.shadowRoot = host.attachShadow({ mode: 'open' });

        var style = document.createElement('style');
        style.textContent = CSS_TEMPLATE.replace('__POSITION_CSS__', getPositionCss(state.config.widgetPosition));
        state.shadowRoot.appendChild(style);

        var widget = document.createElement('div');
        widget.id = 'vw-widget';

        var collapsed = document.createElement('button');
        collapsed.id = 'vw-collapsed';
        collapsed.type = 'button';
        collapsed.setAttribute('aria-label', 'Talk to our AI agent');
        var collapsedLogo = document.createElement('span');
        collapsedLogo.innerHTML = LOGO_SVG;
        var collapsedLabel = document.createElement('span');
        collapsedLabel.id = 'vw-collapsed-label';
        collapsedLabel.textContent = state.config.name || 'Talk to our AI agent';
        collapsed.appendChild(collapsedLogo);
        collapsed.appendChild(collapsedLabel);

        var expanded = document.createElement('div');
        expanded.id = 'vw-expanded';
        expanded.className = 'vw-hidden';
        var expandedLogo = document.createElement('span');
        expandedLogo.innerHTML = LOGO_SVG;
        var barsContainer = document.createElement('div');
        barsContainer.id = 'vw-bars';
        for (var i = 0; i < BAR_COUNT; i++) {
          var bar = document.createElement('div');
          bar.className = 'vw-bar';
          barsContainer.appendChild(bar);
          state.bars.push(bar);
        }
        var label = document.createElement('span');
        label.id = 'vw-label';
        label.textContent = 'Vyostra';
        var errorEl = document.createElement('span');
        errorEl.id = 'vw-error';
        errorEl.className = 'vw-hidden';
        var closeBtn = document.createElement('button');
        closeBtn.id = 'vw-close';
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.textContent = '×';

        expanded.appendChild(expandedLogo);
        expanded.appendChild(barsContainer);
        expanded.appendChild(label);
        expanded.appendChild(errorEl);
        expanded.appendChild(closeBtn);

        widget.appendChild(collapsed);
        widget.appendChild(expanded);
        state.shadowRoot.appendChild(widget);

        state.els.collapsed = collapsed;
        state.els.expanded = expanded;
        state.els.barsContainer = barsContainer;
        state.els.label = label;
        state.els.error = errorEl;
        state.els.close = closeBtn;

        collapsed.addEventListener('click', handleExpandClick);
        closeBtn.addEventListener('click', handleCloseClick);
      } catch (e) {
        /* never break the host site */
      }
    }

    function showError(message) {
      state.els.barsContainer.classList.add('vw-hidden');
      state.els.label.classList.add('vw-hidden');
      state.els.error.textContent = message;
      state.els.error.classList.remove('vw-hidden');
    }

    function clearError() {
      state.els.error.classList.add('vw-hidden');
      state.els.error.textContent = '';
      state.els.barsContainer.classList.remove('vw-hidden');
      state.els.label.classList.remove('vw-hidden');
    }

    function handleExpandClick() {
      state.expanded = true;
      state.els.collapsed.classList.add('vw-hidden');
      state.els.expanded.classList.remove('vw-hidden');
      clearError();
      startAnimationLoop();

      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(function (stream) {
          state.mediaStream = stream;
          setupAudioAnalysis(stream);
          setupRecorder(stream);
          connectWebSocket();
        })
        .catch(function () {
          showError('Microphone access required');
        });
    }

    function handleCloseClick() {
      cleanup();
      collapseWidget();
    }

    function collapseWidget() {
      state.expanded = false;
      state.els.expanded.classList.add('vw-hidden');
      state.els.collapsed.classList.remove('vw-hidden');
    }

    function setupAudioAnalysis(stream) {
      var AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      state.audioContext = new AudioContextCtor();
      state.analyser = state.audioContext.createAnalyser();
      state.analyser.fftSize = 64;
      state.dataArray = new Uint8Array(state.analyser.frequencyBinCount);
      state.source = state.audioContext.createMediaStreamSource(stream);
      state.source.connect(state.analyser);
    }

    function setupRecorder(stream) {
      var mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
      }
      state.mediaRecorder = new MediaRecorder(stream, { mimeType: mimeType });
      state.mediaRecorder.ondataavailable = function (event) {
        if (!event.data || event.data.size === 0) return;
        if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
        var reader = new FileReader();
        reader.onloadend = function () {
          var result = reader.result || '';
          var commaIndex = result.indexOf(',');
          var base64Data = commaIndex !== -1 ? result.substring(commaIndex + 1) : '';
          if (!base64Data) return;
          try {
            state.ws.send(JSON.stringify({ type: 'audio', data: base64Data }));
          } catch (e) {
            /* ignore send failures */
          }
        };
        reader.readAsDataURL(event.data);
      };
    }

    function connectWebSocket() {
      var url = WS_URL + '?agentId=' + encodeURIComponent(agentId);
      var ws = new WebSocket(url);
      state.ws = ws;

      ws.onopen = function () {
        if (state.mediaRecorder && state.mediaRecorder.state === 'inactive') {
          state.mediaRecorder.start(RECORDER_TIMESLICE_MS);
        }
        state.pingInterval = setInterval(function () {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, PING_INTERVAL_MS);
      };

      ws.onmessage = function (event) {
        var msg;
        try {
          msg = JSON.parse(event.data);
        } catch (e) {
          return;
        }
        if (!msg || !msg.type) return;
        if (msg.type === 'audio') {
          playAudioChunk(msg.data);
        } else if (msg.type === 'ended') {
          cleanup();
          collapseWidget();
        }
        /* type 'transcript' and 'pong' are ignored */
      };

      ws.onclose = function () {
        cleanup();
        collapseWidget();
      };

      ws.onerror = function () {
        cleanup();
        collapseWidget();
      };
    }

    function base64ToArrayBuffer(base64) {
      var binaryStr = atob(base64);
      var len = binaryStr.length;
      var bytes = new Uint8Array(len);
      for (var i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      return bytes.buffer;
    }

    function playAudioChunk(base64Data) {
      if (!base64Data || !state.audioContext) return;
      try {
        var arrayBuffer = base64ToArrayBuffer(base64Data);
        state.audioContext.decodeAudioData(
          arrayBuffer,
          function (audioBuffer) {
            if (!state.audioContext) return;
            var sourceNode = state.audioContext.createBufferSource();
            sourceNode.buffer = audioBuffer;
            sourceNode.connect(state.audioContext.destination);
            sourceNode.start(0);
          },
          function () {
            /* ignore decode failures */
          }
        );
      } catch (e) {
        /* ignore playback failures */
      }
    }

    function startAnimationLoop() {
      function tick() {
        if (state.analyser && state.dataArray) {
          state.analyser.getByteFrequencyData(state.dataArray);
          state.bars.forEach(function (bar, i) {
            var value = state.dataArray[i] || 0;
            var height = 3 + (value / 255) * 18;
            bar.style.height = height + 'px';
          });
        } else {
          state.idleTick += 0.12;
          state.bars.forEach(function (bar, i) {
            var height = 3 + Math.max(0, Math.sin(state.idleTick + i * 0.4)) * 2;
            bar.style.height = height + 'px';
          });
        }
        state.animFrame = requestAnimationFrame(tick);
      }
      state.animFrame = requestAnimationFrame(tick);
    }

    function cleanup() {
      if (state.mediaRecorder) {
        try {
          if (state.mediaRecorder.state !== 'inactive') {
            state.mediaRecorder.stop();
          }
        } catch (e) { /* ignore */ }
      }
      if (state.mediaStream) {
        state.mediaStream.getTracks().forEach(function (track) {
          try { track.stop(); } catch (e) { /* ignore */ }
        });
      }
      if (state.audioContext) {
        try { state.audioContext.close(); } catch (e) { /* ignore */ }
      }
      if (state.pingInterval) {
        clearInterval(state.pingInterval);
      }
      if (state.animFrame) {
        cancelAnimationFrame(state.animFrame);
      }
      if (state.ws) {
        try {
          if (state.ws.readyState === WebSocket.OPEN) {
            state.ws.send(JSON.stringify({ type: 'end' }));
          }
        } catch (e) { /* ignore */ }
        try { state.ws.close(); } catch (e) { /* ignore */ }
      }
      state.mediaRecorder = null;
      state.mediaStream = null;
      state.audioContext = null;
      state.analyser = null;
      state.dataArray = null;
      state.source = null;
      state.pingInterval = null;
      state.animFrame = null;
      state.ws = null;
      state.bars.forEach(function (bar) {
        bar.style.height = '3px';
      });
      if (state.els.error) clearError();
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  } catch (e) {
    if (window.console && console.error) {
      console.error('[VyostraAI Voice] Widget failed to initialize:', e);
    }
  }
})();
