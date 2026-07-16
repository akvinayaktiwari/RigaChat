(function () {
  'use strict';
  try {
    var BACKEND_URL = '__BACKEND_URL__';
    var __VOICE_RELAY_URL__ = 'wss://voice.drsyeta.in';

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
      scriptProcessor: null,
      ws: null,
      pingInterval: null,
      animFrame: null,
      idleTick: 0,
      audioQueue: null,
      isPlayingAudio: false,
      currentSource: null
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
          setupPCMCapture(stream);
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
      state.audioContext = new AudioContextCtor({ sampleRate: 24000 });
      state.analyser = state.audioContext.createAnalyser();
      state.analyser.fftSize = 64;
      state.dataArray = new Uint8Array(state.analyser.frequencyBinCount);
      state.source = state.audioContext.createMediaStreamSource(stream);
      state.source.connect(state.analyser);
    }

    function setupPCMCapture(stream) {
      // ScriptProcessorNode: deprecated but universally supported, no blob/CSP issues
      var CHUNK_SIZE = 4096;
      var source = state.audioContext.createMediaStreamSource(stream);
      state.source = source;

      var processor = state.audioContext.createScriptProcessor(CHUNK_SIZE, 1, 1);
      state.scriptProcessor = processor;

      processor.onaudioprocess = function (e) {
        if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
        var input = e.inputBuffer.getChannelData(0); // Float32, native rate (24kHz)
        var pcm = new Int16Array(input.length);
        for (var i = 0; i < input.length; i++) {
          var s = Math.max(-1, Math.min(1, input[i]));
          pcm[i] = s < 0 ? s * 32768 : s * 32767;
        }
        var base64 = btoa(String.fromCharCode.apply(null, new Uint8Array(pcm.buffer)));
        try {
          state.ws.send(JSON.stringify({ type: 'audio', data: base64 }));
        } catch (err) {
          console.error('[VoiceWidget] send error:', err.message);
        }
      };

      source.connect(state.analyser);   // keep visualizer working
      source.connect(processor);
      processor.connect(state.audioContext.destination);
    }

    function connectWebSocket() {
      fetch(BACKEND_URL + '/api/voice-agents/token?agentId=' + encodeURIComponent(agentId))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          var wsUrl = __VOICE_RELAY_URL__ + '?agentId=' + encodeURIComponent(agentId) + '&token=' + data.token;
          var ws = new WebSocket(wsUrl);
          state.ws = ws;

          ws.onopen = function () {
            console.log('[VoiceWidget] WebSocket open');
            state.pingInterval = setInterval(function () {
              if (state.ws && state.ws.readyState === WebSocket.OPEN) {
                state.ws.send(JSON.stringify({ type: 'ping' }));
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
              console.log('[VoiceWidget] audio frame received, base64 length:', msg.data ? msg.data.length : msg.data);

              // Decode base64 PCM16 → Float32 → play via AudioContext
              var raw = atob(msg.data);
              console.log('[VoiceWidget] decoded raw bytes:', raw.length);

              var pcm16 = new Int16Array(raw.length / 2);
              for (var i = 0; i < pcm16.length; i++) {
                pcm16[i] = (raw.charCodeAt(i * 2)) | (raw.charCodeAt(i * 2 + 1) << 8);
              }
              var float32 = new Float32Array(pcm16.length);
              for (var j = 0; j < pcm16.length; j++) {
                float32[j] = pcm16[j] / 32768.0;
              }

              console.log('[VoiceWidget] AudioContext state:', state.audioContext ? state.audioContext.state : state.audioContext, 'sampleRate:', state.audioContext ? state.audioContext.sampleRate : state.audioContext);

              var buffer = state.audioContext.createBuffer(1, float32.length, 24000);
              buffer.copyToChannel(float32, 0);

              if (!state.audioQueue) { state.audioQueue = []; }
              state.audioQueue.push(buffer);
              console.log('[VoiceWidget] queue length:', state.audioQueue.length, 'isPlaying:', state.isPlayingAudio);
              if (!state.isPlayingAudio) { playNextAudioChunk(); }
            } else if (msg.type === 'barge-in') {
              // Stop agent audio playback immediately
              if (state.audioQueue) { state.audioQueue = []; }
              if (state.currentSource) {
                try { state.currentSource.stop(); } catch (e) {}
                state.currentSource = null;
              }
              console.log('[VoiceWidget] barge-in: agent interrupted');
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
        })
        .catch(function (err) {
          console.error('[VoiceWidget] token fetch failed:', err);
        });
    }

    function playNextAudioChunk() {
      console.log('[VoiceWidget] playNextAudioChunk called, queue:', state.audioQueue ? state.audioQueue.length : state.audioQueue);
      if (!state.audioQueue || state.audioQueue.length === 0) {
        state.isPlayingAudio = false;
        return;
      }
      state.isPlayingAudio = true;
      var buffer = state.audioQueue.shift();
      var source = state.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(state.audioContext.destination);
      state.currentSource = source;
      source.onended = function () {
        console.log('[VoiceWidget] chunk playback ended');
        playNextAudioChunk();
      };
      source.start();
      console.log('[VoiceWidget] chunk playback started, duration:', buffer.duration);
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
      if (state.scriptProcessor) {
        try { state.scriptProcessor.disconnect(); } catch (e) { /* ignore */ }
      }
      if (state.source) {
        try { state.source.disconnect(); } catch (e) { /* ignore */ }
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
      if (state.currentSource) {
        try { state.currentSource.stop(); } catch (e) {}
        state.currentSource = null;
      }
      state.audioQueue = [];
      state.isPlayingAudio = false;
      if (state.ws) {
        try {
          if (state.ws.readyState === WebSocket.OPEN) {
            state.ws.send(JSON.stringify({ type: 'end' }));
          }
        } catch (e) { /* ignore */ }
        try { state.ws.close(); } catch (e) { /* ignore */ }
      }
      state.scriptProcessor = null;
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
