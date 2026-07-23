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

    var LOGO_X = [10.5, 21.25, 32, 42.75, 53.5];
    var LOGO_Y1 = [9.5, 17.5, 27.5, 17.5, 9.5];
    var LOGO_Y2 = [22.5, 36.5, 52.5, 36.5, 22.5];

    var LOGO_SVG =
      '<svg width="20" height="20" viewBox="0 0 64 64" fill="none">' +
      '<line x1="' + LOGO_X[0] + '" y1="' + LOGO_Y1[0] + '" x2="' + LOGO_X[0] + '" y2="' + LOGO_Y2[0] + '" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/>' +
      '<line x1="' + LOGO_X[1] + '" y1="' + LOGO_Y1[1] + '" x2="' + LOGO_X[1] + '" y2="' + LOGO_Y2[1] + '" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/>' +
      '<line x1="' + LOGO_X[2] + '" y1="' + LOGO_Y1[2] + '" x2="' + LOGO_X[2] + '" y2="' + LOGO_Y2[2] + '" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/>' +
      '<line x1="' + LOGO_X[3] + '" y1="' + LOGO_Y1[3] + '" x2="' + LOGO_X[3] + '" y2="' + LOGO_Y2[3] + '" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/>' +
      '<line x1="' + LOGO_X[4] + '" y1="' + LOGO_Y1[4] + '" x2="' + LOGO_X[4] + '" y2="' + LOGO_Y2[4] + '" stroke="#ffffff" stroke-width="7" stroke-linecap="round"/>' +
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
      'font-size:14px;line-height:1;flex-shrink:0;padding:0}' +
      '@keyframes vyostraVoiceGlow{0%,100%{filter:drop-shadow(0 0 4px rgba(255,255,255,.25))}' +
      '50%{filter:drop-shadow(0 0 12px rgba(255,255,255,.5))}}' +
      '.vw-logo-glow{animation:vyostraVoiceGlow 3.2s ease-in-out infinite}' +
      '@media (prefers-reduced-motion:reduce){.vw-logo-glow{animation:none!important}}';

    function getPositionCss(position) {
      if (position === 'bottom-left') {
        return 'position:fixed;bottom:24px;left:24px';
      }
      if (position === 'bottom-center') {
        return 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%)';
      }
      return 'position:fixed;bottom:24px;right:24px';
    }

    // Idle glow + ripple for the launcher's Signal mark. Fully separate from
    // `state` above (the call/session store) — read by nothing but the
    // functions below, so it can't affect connection logic.
    var launcherRipple = { lines: null, raf: 0, timeoutId: 0, intervalId: 0, stopped: true };
    var launcherGuard = { tabVisible: true, inView: true };

    function setLogoBar(i, y1, y2) {
      var ln = launcherRipple.lines && launcherRipple.lines[i];
      if (!ln) return;
      ln.setAttribute('y1', String(y1));
      ln.setAttribute('y2', String(y2));
    }

    function resetLogoBars() {
      for (var i = 0; i < 5; i++) setLogoBar(i, LOGO_Y1[i], LOGO_Y2[i]);
    }

    function rippleOnce() {
      var t0 = performance.now();
      var dur = 900;
      function frame(now) {
        if (launcherRipple.stopped) return;
        var p = (now - t0) / dur;
        if (p >= 1) {
          resetLogoBars();
          return;
        }
        for (var i = 0; i < 5; i++) {
          var local = Math.min(1, Math.max(0, p * 1.7 - i * 0.14));
          var bump = Math.sin(local * Math.PI) * 3.2;
          setLogoBar(i, LOGO_Y1[i] - bump, LOGO_Y2[i] + bump);
        }
        launcherRipple.raf = requestAnimationFrame(frame);
      }
      launcherRipple.raf = requestAnimationFrame(frame);
    }

    function startLauncherRipple() {
      if (!launcherRipple.lines || launcherRipple.lines.length !== 5) return;
      if (!launcherRipple.stopped) return;
      launcherRipple.stopped = false;
      launcherRipple.timeoutId = setTimeout(rippleOnce, 900);
      launcherRipple.intervalId = setInterval(rippleOnce, 4200);
    }

    function stopLauncherRipple() {
      launcherRipple.stopped = true;
      if (launcherRipple.raf) cancelAnimationFrame(launcherRipple.raf);
      if (launcherRipple.timeoutId) clearTimeout(launcherRipple.timeoutId);
      if (launcherRipple.intervalId) clearInterval(launcherRipple.intervalId);
      launcherRipple.raf = 0;
      launcherRipple.timeoutId = 0;
      launcherRipple.intervalId = 0;
      resetLogoBars();
    }

    function refreshLauncherRipple() {
      if (launcherGuard.tabVisible && launcherGuard.inView) {
        startLauncherRipple();
      } else {
        stopLauncherRipple();
      }
    }

    // Panel-header mark: converges to a centered shape on call start and
    // holds there for the whole call — no shape animation tied to audio.
    // Only the glow reacts, driven by a smoothed state.isPlayingAudio
    // boolean (no AnalyserNode on the playback path). Entirely separate
    // from `state` above — read only by the functions below, never
    // branched on by connection/session logic.
    var PANEL_CONVERGED_Y1 = 26;
    var PANEL_CONVERGED_Y2 = 38;
    var GLOW_EASE = 0.12;
    var panelMorph = { lines: null, logoEl: null, raf: 0, phase: 'resting' };
    var agentLevel = 0;

    function setPanelBar(i, y1, y2) {
      var ln = panelMorph.lines && panelMorph.lines[i];
      if (!ln) return;
      ln.setAttribute('y1', String(y1));
      ln.setAttribute('y2', String(y2));
    }

    function easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function morphPanelToConverged() {
      if (!panelMorph.lines || panelMorph.lines.length !== 5) return;
      if (panelMorph.phase !== 'resting') return;
      panelMorph.phase = 'morphing';
      agentLevel = 0;
      var t0 = performance.now();
      var dur = 900;
      function frame(now) {
        var p = Math.min(1, (now - t0) / dur);
        var e = easeInOutCubic(p);
        for (var i = 0; i < 5; i++) {
          setPanelBar(
            i,
            LOGO_Y1[i] + (PANEL_CONVERGED_Y1 - LOGO_Y1[i]) * e,
            LOGO_Y2[i] + (PANEL_CONVERGED_Y2 - LOGO_Y2[i]) * e
          );
        }
        if (p < 1) {
          panelMorph.raf = requestAnimationFrame(frame);
        } else {
          panelMorph.phase = 'converged';
          panelMorph.raf = 0;
        }
      }
      panelMorph.raf = requestAnimationFrame(frame);
    }

    // Instant snap, no animation — must never delay cleanup()/collapseWidget().
    // Naturally idempotent: a repeat call after 'resting' is a harmless no-op.
    function snapPanelToV() {
      if (panelMorph.raf) {
        cancelAnimationFrame(panelMorph.raf);
        panelMorph.raf = 0;
      }
      if (panelMorph.phase === 'resting') return;
      panelMorph.phase = 'resting';
      if (panelMorph.logoEl) panelMorph.logoEl.style.filter = '';
      if (!panelMorph.lines || panelMorph.lines.length !== 5) return;
      for (var i = 0; i < 5; i++) setPanelBar(i, LOGO_Y1[i], LOGO_Y2[i]);
    }

    function updatePanelGlow() {
      if (!panelMorph.logoEl) return;
      var target = state.isPlayingAudio ? 1 : 0;
      agentLevel += (target - agentLevel) * GLOW_EASE;
      var level = state.isPlayingAudio ? agentLevel : 0;
      var now = performance.now();
      var breathe = 0.15 + 0.15 * Math.sin((now * 2 * Math.PI) / 3200);
      var pulse = Math.max(breathe, level);
      var blur = 4 + pulse * 12;
      var alpha = 0.25 + pulse * 0.45;
      panelMorph.logoEl.style.filter = 'drop-shadow(0 0 ' + blur.toFixed(2) + 'px rgba(255,255,255,' + alpha.toFixed(2) + '))';
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
        panelMorph.lines = expandedLogo.querySelectorAll('line');
        panelMorph.logoEl = expandedLogo;
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

        var reducedMotion = window.matchMedia &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        if (!reducedMotion) {
          launcherRipple.lines = collapsedLogo.querySelectorAll('line');
          collapsedLogo.classList.add('vw-logo-glow');

          launcherGuard.tabVisible = document.visibilityState === 'visible';

          document.addEventListener('visibilitychange', function () {
            launcherGuard.tabVisible = document.visibilityState === 'visible';
            refreshLauncherRipple();
          });

          if (window.IntersectionObserver) {
            var observer = new IntersectionObserver(function (entries) {
              launcherGuard.inView = entries[0].isIntersecting;
              refreshLauncherRipple();
            });
            observer.observe(collapsed);
          } else {
            refreshLauncherRipple();
          }
        }
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
      morphPanelToConverged();

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
      if (state.audioContext.state === 'suspended') {
        state.audioContext.resume();
      }
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
          var contextPromise = fetch(BACKEND_URL + '/api/voice-agents/context/' + agentId)
            .then(function (r) { return r.json(); })
            .catch(function (err) {
              console.error('[VoiceWidget] context fetch failed:', err);
              return null;
            });

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

            contextPromise.then(function (ctx) {
              if (ctx && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'context',
                  instructions: ctx.instructions,
                  voice: ctx.voice,
                  botName: ctx.botName
                }));
                console.log('[VoiceWidget] context sent to relay');
              }
            });
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
              // Decode base64 PCM16 → Float32 → play via AudioContext
              var raw = atob(msg.data);
              var pcm16 = new Int16Array(raw.length / 2);
              for (var i = 0; i < pcm16.length; i++) {
                pcm16[i] = (raw.charCodeAt(i * 2)) | (raw.charCodeAt(i * 2 + 1) << 8);
              }
              var float32 = new Float32Array(pcm16.length);
              for (var j = 0; j < pcm16.length; j++) {
                float32[j] = pcm16[j] / 32768.0;
              }

              var buffer = state.audioContext.createBuffer(1, float32.length, 24000);
              buffer.copyToChannel(float32, 0);

              if (!state.audioQueue) { state.audioQueue = []; }
              state.audioQueue.push(buffer);
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
      source.onended = playNextAudioChunk;
      source.start();
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
        updatePanelGlow();
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
      snapPanelToV();
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
