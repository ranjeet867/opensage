// OpenSage — content script
// (c) 2026 Ranjeet Singh. All rights reserved. See LICENSE.

(function () {
  'use strict';
  if (window.__CODESAGE_PRO_CONTENT__) return;
  window.__CODESAGE_PRO_CONTENT__ = true;

  const MODEL                     = 'claude-haiku-4-5-20251001';
  const MAX_TOKENS                = 1500;
  const AUTO_SCAN_MS              = 12000;
  const DOM_OBSERVER_DEBOUNCE_MS  = 500;
  const CONTEXT_CACHE_TTL_MS      = 8000;

  const state = {
    bootstrapped: false,
    apiKey: '',
    enabled: false,
    audioAssist: false,
    speakResults: false,
    largeText: false,
    highContrast: false,
    overlayVisible: false,
    listening: false,
    scanning: false,
    page: window.IA_SITE_DETECTOR.detectPage(),
    context: null,
    contextDigest: '',
    contextCachedAt: 0,
    tokens: 0,
    lastDigest: '',
    lastScanAt: 0,
    scanTimer: null,
    barPos: null
  };

  // --- Copy-clean code storage ---
  // Holds the *raw* (pre-escape) content of each fenced code block,
  // so the Copy button writes clean text to the clipboard — never
  // HTML-entities, never markdown fences, never sentinel markers.
  const codeStore = new Map(); // id -> { lang, code }
  let codeCounter = 0;

  let root;
  let audioController;
  let domObserver = null;
  let dragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let domRefreshTimer = null;

  async function bootstrap() {
    if (state.bootstrapped) return;
    state.bootstrapped = true;
    await syncSettings();
    chrome.runtime.onMessage.addListener(onRuntimeMessage);
    chrome.storage.onChanged.addListener(onStorageChanged);
    if (state.enabled) mountOverlay();
  }

  function onStorageChanged(changes, area) {
    if (area !== 'local') return;
    const keys = Object.keys(changes);
    if (!keys.some((k) => k.startsWith('ia_'))) return;
    refreshSettings().catch((e) => console.warn('[OpenSage] storage sync', e));
  }

  function onRuntimeMessage(msg, _sender, sendResponse) {
    if (msg.type === 'GET_PAGE_CONTEXT') {
      sendResponse(getPageStatus());
      return true;
    }
    if (msg.type === 'SETTINGS_UPDATED') {
      refreshSettings().catch((e) => console.warn('[OpenSage] refreshSettings', e));
      return true;
    }
    if (msg.type === 'FORCE_HIDE_OVERLAY') {
      // Disabled from popup — tear it down right now on every tab.
      state.enabled = false;
      unmountOverlay();
      return true;
    }
    if (msg.type === 'TOGGLE_OVERLAY') {
      ensureOverlayMounted();
      toggleOverlay();
      return true;
    }
    if (msg.type === 'QUICK_ACTION') {
      ensureOverlayMounted();
      toggleOverlay(true);
      if (msg.action) startFreshQuickAction(msg.action);
      return true;
    }
    if (msg.type === 'CAPTURE_SS') {
      ensureOverlayMounted();
      toggleOverlay(true);
      handleCapture(msg.dataUrl).catch((e) => console.warn('[OpenSage] capture', e));
      return true;
    }
    if (msg.type === 'CAPTURE_SS_REQUEST') {
      ensureOverlayMounted();
      toggleOverlay(true);
      runManualScreenAnalysis().catch((e) => console.warn('[OpenSage] capture-req', e));
      return true;
    }
    if (msg.type === 'SELECTION_ACTION') {
      ensureOverlayMounted();
      toggleOverlay(true);
      // If the user picked "Ask anything about selection…", drop the
      // selection in the prompt box and wait for them to type a question.
      // Otherwise run the action immediately.
      const selection = (msg.selection || '').trim() || readPageSelection();
      if (msg.promptUser) {
        prefillPromptForSelection(selection);
      } else {
        runSelectionAction(msg.action || 'selection', selection)
          .catch((e) => console.warn('[OpenSage] selection-action', e));
      }
      return true;
    }
    return true;
  }

  function readPageSelection() {
    try {
      const sel = window.getSelection();
      return sel ? String(sel.toString() || '').trim() : '';
    } catch (_) { return ''; }
  }

  function prefillPromptForSelection(selection) {
    if (!root) return;
    const promptEl = root.querySelector('#ia-prompt');
    if (!promptEl) return;
    const preview = selection ? `\n\n--- selected code ---\n${selection}` : '';
    promptEl.value = `Help me with this:${preview}`;
    promptEl.focus();
    promptEl.dispatchEvent(new Event('input', { bubbles: true }));
    root.classList.add('ia-prompt-expanded');
    setStatus('Type your question and press Ask', false);
  }

  async function runSelectionAction(action, selection) {
    if (!root) return;
    if (!state.apiKey) return addError('Add your Anthropic API key in the popup first.');
    if (!selection) return addError('No text was selected on the page. Highlight some code first.');
    refreshPageContext();
    const context = {
      ...state.context,
      siteLabel: state.page.siteLabel,
      selection
    };
    const prompt = window.IA_PROMPTS.buildActionPrompt(action, context, '');
    setStatus('Thinking about your selection...', true);
    try {
      const reply = await callText(prompt.user, prompt.system);
      addAnswer(labelForSelectionAction(action), reply);
      maybeSpeak(reply);
    } catch (error) {
      addError(error.message);
    } finally {
      setStatus(state.listening ? 'Listening' : 'Ready', false);
    }
  }

  function labelForSelectionAction(action) {
    const map = {
      selection:    'Selection · Help',
      howto:        'Selection · How to use',
      findIssues:   'Selection · Bugs',
      refactor:     'Selection · Refactor',
      tests:        'Selection · Tests',
      complete:     'Selection · Complete',
      explain:      'Selection · Explain'
    };
    return map[action] || 'Selection · Action';
  }

  function ensureOverlayMounted() {
    if (!root) mountOverlay();
  }

  function mountOverlay() {
    if (root) return;
    root = window.IA_OVERLAY_UI.createOverlay();
    bindOverlayEvents();
    applyStoredPosition();
    applyPreferences();
    refreshPageContext();
    render();
  }

  function unmountOverlay() {
    if (!root) return;
    clearTimeout(domRefreshTimer);
    domRefreshTimer = null;
    if (audioController) {
      try { audioController.stop(); } catch (_) {}
      audioController = null;
    }
    state.listening = false;
    clearInterval(state.scanTimer);
    state.scanTimer = null;
    state.scanning = false;
    if (domObserver) {
      domObserver.disconnect();
      domObserver = null;
    }
    dragging = false;
    document.removeEventListener('mousemove', onDocumentMouseMove);
    document.removeEventListener('mouseup', onDocumentMouseUp);
    document.removeEventListener('keydown', onGlobalKeydown, true);
    root.remove();
    root = null;
    state.overlayVisible = false;
  }

  function onDocumentMouseMove(event) { onDrag(event); }
  function onDocumentMouseUp() { stopDrag(); }

  async function syncSettings() {
    const settings = await chrome.storage.local.get([
      'ia_api_key',
      'ia_enabled',
      'ia_audio_assist',
      'ia_speak_results',
      'ia_large_text',
      'ia_high_contrast',
      'ia_bar_pos'
    ]);
    state.apiKey = settings.ia_api_key || '';
    state.enabled = !!settings.ia_enabled;
    state.audioAssist = !!settings.ia_audio_assist;
    state.speakResults = !!settings.ia_speak_results;
    state.largeText = !!settings.ia_large_text;
    state.highContrast = !!settings.ia_high_contrast;
    state.barPos = settings.ia_bar_pos || null;
  }

  function bindOverlayEvents() {
    const listenBtn  = root.querySelector('#ia-listen-btn');
    const scanBtn    = root.querySelector('#ia-scan-btn');
    const askBtn     = root.querySelector('#ia-ask-btn');
    const promptEl   = root.querySelector('#ia-prompt');
    const snapBtn    = root.querySelector('#ia-snap-btn');

    listenBtn.addEventListener('click', toggleListening);
    scanBtn.addEventListener('click', toggleScreenAnalysis);
    askBtn.addEventListener('click', () => smartAsk(promptEl.value.trim()));
    snapBtn.addEventListener('click', () => runManualScreenAnalysis());

    promptEl.addEventListener('focus', () => root.classList.add('ia-prompt-expanded'));
    promptEl.addEventListener('blur', () => {
      if (!promptEl.value.trim()) root.classList.remove('ia-prompt-expanded');
    });
    promptEl.addEventListener('input', () => {
      promptEl.style.height = 'auto';
      promptEl.style.height = `${Math.min(promptEl.scrollHeight, 220)}px`;
    });
    promptEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        smartAsk(promptEl.value.trim());
      }
    });

    root.querySelector('#ia-hide-btn').addEventListener('click', () => toggleOverlay(false));
    const minBtn = root.querySelector('#ia-min-btn');
    if (minBtn) {
      minBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const minimized = root.classList.toggle('ia-minimized');
        minBtn.textContent = minimized ? '+' : '–';
        minBtn.title = minimized ? 'Expand overlay' : 'Minimize overlay';
      });
    }
    root.querySelectorAll('#ia-quick-actions button[data-action]').forEach((button) => {
      button.addEventListener('click', () => startFreshQuickAction(button.dataset.action));
    });
    root.querySelector('#ia-clear-btn').addEventListener('click', clearSession);

    const bar = root.querySelector('#ia-bar');
    bar.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', onDocumentMouseMove);
    document.addEventListener('mouseup', onDocumentMouseUp);

    audioController = window.IA_AUDIO.createAudioController({
      onTranscript: handleTranscript,
      onStateChange: handleAudioState,
      minChars: 4,
      silenceMs: 1300
    });

    domObserver = new MutationObserver(() => scheduleDomRefresh('mutation'));
    domObserver.observe(document.body, { subtree: true, childList: true });

    // In-overlay keyboard shortcuts
    document.addEventListener('keydown', onGlobalKeydown, true);
  }

  function onGlobalKeydown(event) {
    if (!root) return;
    const key = event.key;
    const meta = event.metaKey || event.ctrlKey;
    const inEditable = isEditableTarget(event.target);

    // Esc — instantly hide the overlay (panic key). Works anywhere except
    // when typing in a page input (so we don't steal Esc from forms).
    if (key === 'Escape' && state.overlayVisible && !inEditable) {
      event.preventDefault();
      toggleOverlay(false);
      return;
    }

    // Ctrl/Cmd + Shift + K  →  focus the prompt box and expand the overlay
    if (meta && event.shiftKey && (key === 'K' || key === 'k')) {
      event.preventDefault();
      ensureOverlayMounted();
      toggleOverlay(true);
      const promptEl = root.querySelector('#ia-prompt');
      if (promptEl) {
        promptEl.focus();
        root.classList.add('ia-prompt-expanded');
      }
      return;
    }

    // Ctrl/Cmd + Shift + L  →  clear all answers
    if (meta && event.shiftKey && (key === 'L' || key === 'l')) {
      event.preventDefault();
      if (state.overlayVisible) clearSession();
      return;
    }

    // Ctrl/Cmd + Shift + M  →  toggle minimize / expand
    if (meta && event.shiftKey && (key === 'M' || key === 'm')) {
      event.preventDefault();
      const minBtn = root.querySelector('#ia-min-btn');
      if (minBtn) minBtn.click();
      return;
    }
  }

  function isEditableTarget(node) {
    if (!node) return false;
    if (root && root.contains(node)) return true; // inside our own prompt — already handled
    const tag = (node.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (node.isContentEditable) return true;
    return false;
  }

  async function refreshSettings() {
    await syncSettings();
    if (state.enabled) {
      if (!root) mountOverlay();
      else {
        applyPreferences();
        render();
      }
    } else {
      unmountOverlay();
    }
    syncAutoScan();
  }

  function refreshPageContext({ force = false } = {}) {
    state.page = window.IA_SITE_DETECTOR.detectPage();
    if (!force && state.context && Date.now() - state.contextCachedAt < CONTEXT_CACHE_TTL_MS) return;

    const extracted = window.IA_CONTENT_EXTRACTOR.extractPageContext(state.page.siteId);
    const digest = digestContext(extracted);
    if (!force && digest && digest === state.contextDigest) {
      state.contextCachedAt = Date.now();
      return;
    }
    state.context = extracted;
    state.contextDigest = digest;
    state.contextCachedAt = Date.now();
  }

  function scheduleDomRefresh(reason) {
    if (!root) return;
    if (!state.overlayVisible && !state.enabled) return;
    if (domRefreshTimer) clearTimeout(domRefreshTimer);
    domRefreshTimer = setTimeout(() => {
      refreshPageContext();
      render();
    }, DOM_OBSERVER_DEBOUNCE_MS);
  }

  function getPageStatus() {
    return {
      supported: state.page.supported,
      siteLabel: state.page.siteLabel,
      classification: state.page.classification,
      enabled: state.enabled,
      title: state.context?.title || '',
      language: state.context?.language || '',
      reason: state.page.reason
    };
  }

  function toggleOverlay(force) {
    if (!root) return;
    state.overlayVisible = force !== undefined ? force : !state.overlayVisible;
    root.classList.toggle('ia-hidden', !state.overlayVisible);
    if (!state.overlayVisible && state.listening) stopListening();
    syncAutoScan();
  }

  function toggleListening() {
    if (state.listening) stopListening();
    else void startListening();
  }

  async function startListening() {
    await syncSettings();
    if (!state.audioAssist) {
      return addError('Turn on "Spoken prompts" in the extension popup, then click Listen again.');
    }
    if (!state.apiKey) return addError('Add your Anthropic API key in the popup first.');
    try { audioController.start(); }
    catch (error) { addError(error.message); }
  }

  function stopListening() { audioController.stop(); }

  function handleTranscript(text, isFinal) {
    if (!root) return;
    const promptEl = root.querySelector('#ia-prompt');
    promptEl.value = text || '';
    if (text) root.classList.add('ia-prompt-expanded');
    promptEl.dispatchEvent(new Event('input', { bubbles: true }));
    if (isFinal && state.audioAssist) runAction('voice', text);
  }

  function handleAudioState(nextState) {
    state.listening = nextState === 'listening';
    if (String(nextState).startsWith('error:')) addError(`Microphone error: ${nextState.split(':')[1]}`);
    if (root) render();
  }

  function toggleScreenAnalysis() {
    state.scanning = !state.scanning;
    syncAutoScan();
    render();
  }

  function syncAutoScan() {
    const shouldScan = state.enabled && state.overlayVisible && state.scanning && !!state.apiKey;
    if (!shouldScan) {
      clearInterval(state.scanTimer);
      state.scanTimer = null;
      return;
    }
    if (state.scanTimer) return;
    state.scanTimer = setInterval(() => {
      runAutoScan().catch((error) => console.warn('[OpenSage] auto-scan', error));
    }, AUTO_SCAN_MS);
  }

  async function runAutoScan() {
    if (Date.now() - state.lastScanAt < AUTO_SCAN_MS - 200) return;
    state.lastScanAt = Date.now();
    refreshPageContext();
    if (state.context?.hasStrongDomContext) {
      if (Date.now() - state.contextCachedAt < CONTEXT_CACHE_TTL_MS && state.contextDigest) return;
      await runAction('coach', 'Refresh guidance from the current page context.', { source: 'auto-dom' });
      return;
    }
    const capture = await chrome.runtime.sendMessage({ type: 'CAPTURE_TAB' });
    if (capture?.dataUrl) await handleCapture(capture.dataUrl, true);
  }

  async function runManualScreenAnalysis() {
    if (!state.apiKey) return addError('Add your Anthropic API key in the popup first.');
    setStatus('Capturing screen...', true);
    const capture = await chrome.runtime.sendMessage({ type: 'CAPTURE_TAB' });
    if (!capture?.dataUrl) { setStatus('Ready', false); return addError('Could not capture the current tab.'); }
    await handleCapture(capture.dataUrl, false);
  }

  async function handleCapture(dataUrl, silent = false) {
    if (!root) return;
    if (!state.apiKey) return addError('Add your Anthropic API key in the popup first.');
    const digest = hashPreview(dataUrl);
    if (silent && digest === state.lastDigest) return;
    state.lastDigest = digest;
    setStatus('Analyzing screen...', true);
    try {
      refreshPageContext();
      const prompt = window.IA_PROMPTS.buildVisionPrompt({
        ...state.context,
        siteLabel: state.page.siteLabel
      });
      const base64 = dataUrl.split(',')[1];
      const mediaType = dataUrl.split(';')[0].split(':')[1];
      const reply = await callVision(base64, mediaType, prompt.system, prompt.user);
      addAnswer(silent ? 'Auto Screen Analysis' : 'Screen Analysis', reply);
      maybeSpeak(reply);
    } catch (error) {
      addError(error.message);
    } finally {
      setStatus(state.listening ? 'Listening' : 'Ready', false);
    }
  }

  // --- Intelligent intent routing for the Ask box ---
  // The user can type things like:
  //   "how do I improve the current function on screen?"
  //   "find bugs in this code"
  //   "what does this page show"
  //   "explain what's on screen right now"
  // We detect the intent locally and pick the right action / context source
  // (DOM code, screenshot, or pure conversation) before calling the model.
  function classifyAskIntent(text) {
    const t = String(text || '').toLowerCase();
    if (!t) return { kind: 'empty' };

    const screenWords = /(screen|screenshot|capture|on display|display|i'?m sharing|they(?:'re| are) sharing|shared screen|sharing screen|video call|on the call|in the meeting|what (?:is )?shown|what (?:do )?you see|look at (?:my|the) screen|see the screen|on my ide|in (?:the )?ide|in vs ?code|in intellij|in eclipse|in pycharm|webstorm|in editor|ide here)/;
    const currentWords = /(this|current|here|above|below|the visible|on this page|this code|this function|this file|this snippet|this method|this class|the code|the function|the page|the problem|selected code|highlighted)/;
    const reviewWords = {
      findIssues:    /(bug|defect|issue|broken|wrong|incorrect|fail(?:ing)?|error in|edge case|off[- ]by[- ]one|crash)/,
      security:      /(security|vulnerab|injection|xss|csrf|ssrf|sql ?injection|secret|leak|auth|insecure|cve|owasp)/,
      errorHandling: /(error handling|exception|try ?\/? ?catch|swallow|timeout|retry|crash on|fail gracefully)/,
      refactor:      /(refactor|clean ?up|simplif|rewrite|idiomatic|tidy|restructure|optimi[sz]e|performance|faster|speed up|memory|complexity)/,
      complete:      /(complete|finish|fill in|the rest of|continue (?:writing|the code))/,
      explain:       /(explain|what does (?:this|the code) do|walk me through|how does this work|tell me about (?:this|the))/,
      code:          /(write|generate|build|create|implement|give me code|draft|make a function|sample code)/
    };

    const wantsScreen = screenWords.test(t);
    const refersCurrent = currentWords.test(t);

    let action = 'coach';
    for (const [key, rx] of Object.entries(reviewWords)) {
      if (rx.test(t)) { action = key; break; }
    }

    // If they reference the screen explicitly, capture & vision-analyze.
    if (wantsScreen) return { kind: 'vision', action };
    // If they reference current/this, route as a contextual action on extracted code.
    if (refersCurrent) return { kind: 'context', action };
    // Otherwise treat as a plain Q&A — still pass page context but as background only.
    return { kind: 'free', action };
  }

  async function smartAsk(userText) {
    if (!root) return;
    const text = String(userText || '').trim();
    if (!text) {
      // Empty Ask box → behave like Coach on the current page.
      return runAction('coach', '');
    }
    if (!state.apiKey) return addError('Add your Anthropic API key in the popup first.');

    const intent = classifyAskIntent(text);

    // If the user has highlighted code on the page when they Ask,
    // treat that selection as primary context — even without right-clicking.
    const pageSelection = readPageSelection();

    if (intent.kind === 'vision') {
      setStatus('Looking at your screen...', true);
      const capture = await chrome.runtime.sendMessage({ type: 'CAPTURE_TAB' });
      if (!capture?.dataUrl) {
        setStatus('Ready', false);
        return runAction(intent.action, text, { selection: pageSelection });
      }
      await handleAskFromVision(capture.dataUrl, text, intent.action);
      return;
    }

    // 'context' and 'free' both go through runAction; the prompt builder
    // already includes extracted page code & summary, so the model sees it.
    return runAction(intent.action, text, {
      source: intent.kind === 'context' ? 'ask-current' : 'ask-free',
      selection: pageSelection
    });
  }

  async function handleAskFromVision(dataUrl, userText, action) {
    if (!root) return;
    setStatus('Analyzing screen...', true);
    try {
      refreshPageContext();
      const prompt = window.IA_PROMPTS.buildVisionPrompt({
        ...state.context,
        siteLabel: state.page.siteLabel,
        userQuestion: userText,
        focusAction: action
      });
      const base64 = dataUrl.split(',')[1];
      const mediaType = dataUrl.split(';')[0].split(':')[1];
      const reply = await callVision(base64, mediaType, prompt.system, prompt.user);
      addAnswer('Ask · From your screen', reply);
      maybeSpeak(reply);
    } catch (error) {
      addError(error.message);
    } finally {
      setStatus(state.listening ? 'Listening' : 'Ready', false);
    }
  }

  async function runAction(action, userPrompt = '', options = {}) {
    if (!root) return;
    if (!state.apiKey) return addError('Add your Anthropic API key in the popup first.');
    refreshPageContext();
    const context = {
      ...state.context,
      siteLabel: state.page.siteLabel,
      selection: options.selection || ''
    };
    const prompt = window.IA_PROMPTS.buildActionPrompt(action, context, userPrompt);

    setStatus('Thinking...', true);
    try {
      const reply = await callText(prompt.user, prompt.system);
      const tag = options.selection
        ? `${labelForAction(action, options.source)} · with selection`
        : labelForAction(action, options.source);
      addAnswer(tag, reply);
      maybeSpeak(reply);
    } catch (error) {
      addError(error.message);
    } finally {
      setStatus(state.listening ? 'Listening' : 'Ready', false);
    }
  }

  function labelForAction(action, source) {
    if (source === 'auto-dom') return 'Auto DOM Guidance';
    if (source === 'ask-current') return 'Ask · Current code';
    if (source === 'ask-free')    return 'Ask';
    const labels = {
      coach:          'Coach Me',
      explain:        'Explain',
      code:           'Draft Code',
      improve:        'Improve',
      complete:       'Complete',
      voice:          'Voice Question',
      findIssues:     'Find Issues',
      security:       'Security Review',
      errorHandling:  'Error Handling',
      refactor:       'Refactor',
      howto:          'How To Use',
      tests:          'Generate Tests',
      selection:      'Selection · Help'
    };
    return labels[action] || 'OpenSage Action';
  }

  function resetPromptAndAnswers() {
    if (!root) return;
    const promptEl = root.querySelector('#ia-prompt');
    promptEl.value = '';
    promptEl.style.height = '';
    root.classList.remove('ia-prompt-expanded');
    root.querySelector('#ia-answers').replaceChildren();
    codeStore.clear();
    codeCounter = 0;
  }

  function clearSession() {
    if (!root) return;
    resetPromptAndAnswers();
    refreshPageContext({ force: true });
    setStatus('Ready', false);
  }

  function startFreshQuickAction(action) {
    if (!root) return;
    resetPromptAndAnswers();
    refreshPageContext({ force: true });
    void runAction(action, '');
  }

  async function callText(user, system) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': state.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages: [{ role: 'user', content: user }]
      })
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `API ${response.status}`);
    }
    const data = await response.json();
    updateTokens(data.usage);
    return data.content?.[0]?.text || '';
  }

  async function callVision(base64, mediaType, system, prompt) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': state.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `API ${response.status}`);
    }
    const data = await response.json();
    updateTokens(data.usage);
    return data.content?.[0]?.text || '';
  }

  function render() {
    if (!root) return;
    const listenBtn = root.querySelector('#ia-listen-btn');
    const scanBtn = root.querySelector('#ia-scan-btn');
    const site = state.page.siteLabel;

    root.classList.toggle('ia-hidden', !state.overlayVisible);
    root.querySelector('#ia-mode-badge').textContent = site;
    root.querySelector('#ia-footer-state').textContent = state.enabled ? 'Active' : 'Inactive';
    listenBtn.classList.toggle('ia-on', state.listening);
    listenBtn.querySelector('span:last-child').textContent = state.listening ? 'Stop' : 'Listen';
    scanBtn.classList.toggle('ia-on', state.scanning);
    scanBtn.textContent = state.scanning ? 'Stop Auto-Scan' : 'Auto-Scan';
    const promptEl = root.querySelector('#ia-prompt');
    promptEl.placeholder = 'Ask anything — works on every site…';
  }

  // --- Answers & code rendering ---

  function addAnswer(tag, text) {
    if (!root) return;
    const answers = root.querySelector('#ia-answers');
    const el = document.createElement('div');
    el.className = 'ia-answer';
    el.innerHTML = `<div class="ia-answer-tag">${escapeHtml(tag)}</div><div class="ia-answer-body">${renderMarkdown(text)}</div>`;
    answers.insertBefore(el, answers.firstChild);
    el.querySelectorAll('.ia-copy').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.codeId;
        const entry = codeStore.get(id);
        const raw = entry ? entry.code : '';
        navigator.clipboard.writeText(raw).then(() => {
          button.textContent = 'Copied ✓';
          button.classList.add('ia-copied');
          setTimeout(() => {
            button.textContent = 'Copy';
            button.classList.remove('ia-copied');
          }, 1400);
        }).catch(() => {
          // Fallback: use legacy execCommand
          try {
            const ta = document.createElement('textarea');
            ta.value = raw;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
            button.textContent = 'Copied ✓';
            setTimeout(() => { button.textContent = 'Copy'; }, 1400);
          } catch (_) {}
        });
      });
    });
  }

  function addError(message) {
    if (!root) return;
    const answers = root.querySelector('#ia-answers');
    const el = document.createElement('div');
    el.className = 'ia-answer ia-error';
    el.textContent = message;
    answers.insertBefore(el, answers.firstChild);
    setStatus('Error', false);
  }

  function setStatus(text, thinking) {
    if (!root) return;
    const node = root.querySelector('#ia-status-label');
    node.textContent = text;
    node.classList.toggle('ia-thinking', !!thinking);
  }

  function updateTokens(usage) {
    state.tokens += (usage?.input_tokens || 0) + (usage?.output_tokens || 0);
    if (!root) return;
    root.querySelector('#ia-footer-tok').textContent = `${state.tokens.toLocaleString()} tokens`;
  }

  function maybeSpeak(text) {
    if (!state.speakResults || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.slice(0, 900));
    window.speechSynthesis.speak(utterance);
  }

  // Markdown renderer — copy-clean by design.
  //
  // 1. Fenced code blocks are captured BEFORE HTML escaping and stored
  //    verbatim in `codeStore`. A sentinel like \uE000CODE:c3\uE000 is
  //    left behind inside the text.
  // 2. The remaining text is HTML-escaped.
  // 3. Inline markdown (bold, headers, `inline`, lists) is applied to
  //    the escaped text only — NEVER to the raw code.
  // 4. Sentinels are replaced with a rendered <pre> block and a Copy
  //    button. The Copy handler reads from `codeStore`, so pasted code
  //    has no HTML entities, no `#` markdown markers, no \uE000 noise.
  function renderMarkdown(input) {
    let t = String(input || '').trim().replace(/\n{3,}/g, '\n\n');

    const ids = [];
    const s = t.replace(
      /```([a-zA-Z0-9_+\-#.]*)\n?([\s\S]*?)```/g,
      (_m, lang, code) => {
        const id = `c${codeCounter++}`;
        codeStore.set(id, {
          lang: (lang || '').trim() || guessLang(code),
          code: stripEdges(code)
        });
        ids.push(id);
        return `\uE000CODE:${id}\uE000`;
      }
    );

    let html = escapeHtml(s);

    // Bold first — outside-in (so `**foo**` becomes <strong>foo</strong>
    // before any heading/list pass touches it).
    html = html.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
    // Italic, but only single-asterisk pairs that aren't part of bold runs.
    html = html.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');

    // Headings — use the MULTILINE flag so `^` matches every line start,
    // not only the very first character of the response. Vision replies
    // often start with whitespace or arrive after a header that didn't
    // end with a clean \n, which is why the old non-multiline pattern
    // missed them.
    html = html.replace(/^[ \t]*######\s+(.+)$/gm, '<span class="ia-md-h6">$1</span>');
    html = html.replace(/^[ \t]*#####\s+(.+)$/gm, '<span class="ia-md-h5">$1</span>');
    html = html.replace(/^[ \t]*####\s+(.+)$/gm,  '<span class="ia-md-h4">$1</span>');
    html = html.replace(/^[ \t]*###\s+(.+)$/gm,   '<span class="ia-md-h3">$1</span>');
    html = html.replace(/^[ \t]*##\s+(.+)$/gm,    '<span class="ia-md-h2">$1</span>');
    html = html.replace(/^[ \t]*#\s+(.+)$/gm,     '<span class="ia-md-h1">$1</span>');

    // Inline `code`.
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // List bullets.
    html = html.replace(/^[ \t]*[-*]\s+(.+)$/gm, '<span class="ia-md-li">– $1</span>');

    // Numbered lists — render as the same compact line element so they
    // line up nicely with bullets.
    html = html.replace(/^[ \t]*(\d+)\.\s+(.+)$/gm, '<span class="ia-md-li"><span class="ia-md-num">$1.</span> $2</span>');

    // Newlines → <br>.
    html = html.replace(/\n{2,}/g, '<br>').replace(/\n/g, '<br>');
    html = html.replace(/^(<br\s*\/?>\s*)+/i, '');

    for (const id of ids) {
      const token = `\uE000CODE:${id}\uE000`;
      const entry = codeStore.get(id);
      const lang = entry?.lang ? escapeHtml(entry.lang) : '';
      const pre  = escapeHtml(entry?.code || '');
      const block = `<div class="ia-code">` +
        `<div class="ia-code-head">` +
          `<span class="ia-code-lang">${lang || 'code'}</span>` +
          `<button type="button" class="ia-copy" data-code-id="${id}" title="Copy clean code">Copy</button>` +
        `</div>` +
        `<pre>${pre}</pre>` +
      `</div>`;
      html = html.split(token).join(block);
    }
    return `<div class="ia-answer-text">${html}</div>`;
  }

  function stripEdges(code) {
    return String(code || '').replace(/^\s*\n/, '').replace(/\s+$/, '');
  }

  function guessLang(code) {
    if (/#include|std::/.test(code)) return 'cpp';
    if (/public\s+static\s+void\s+main/.test(code)) return 'java';
    if (/def\s+\w+\(/.test(code) && /\bprint\(|\bfrom\s+\w+\s+import\b/.test(code)) return 'python';
    if (/\bfunc\s+\w+\(|package\s+main/.test(code)) return 'go';
    if (/\bfn\s+\w+\(|let\s+mut\b/.test(code)) return 'rust';
    if (/=>|console\.log|const\s+\w+\s*=|function\s+\w+\(/.test(code)) return 'javascript';
    if (/\binterface\s+\w+\s*{|:\s*(string|number|boolean)\b/.test(code)) return 'typescript';
    return '';
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function hashPreview(dataUrl) {
    const sample = dataUrl.slice(0, 140) + dataUrl.slice(-140);
    let hash = 0;
    for (let i = 0; i < sample.length; i++) hash = ((hash << 5) - hash + sample.charCodeAt(i)) | 0;
    return String(hash);
  }

  function digestContext(context) {
    if (!context) return '';
    const sample = [
      context.title,
      context.language,
      (context.statement || '').slice(0, 800),
      (context.code || '').slice(0, 1200),
      (context.cursorContext || '').slice(0, 400)
    ].join('|');
    let hash = 0;
    for (let i = 0; i < sample.length; i++) hash = ((hash << 5) - hash + sample.charCodeAt(i)) | 0;
    return String(hash);
  }

  function applyPreferences() {
    if (!root) return;
    root.classList.toggle('ia-large-text', state.largeText);
    root.classList.toggle('ia-high-contrast', state.highContrast);
  }

  function startDrag(event) {
    if (!root) return;
    if (event.target.closest('button, textarea, input')) return;
    dragging = true;
    const rect = root.getBoundingClientRect();
    dragOffsetX = event.clientX - rect.left;
    dragOffsetY = event.clientY - rect.top;
    event.preventDefault();
  }

  function onDrag(event) {
    if (!dragging || !root) return;
    root.style.left = `${Math.max(0, Math.min(window.innerWidth - 280, event.clientX - dragOffsetX))}px`;
    root.style.top = `${Math.max(0, Math.min(window.innerHeight - 120, event.clientY - dragOffsetY))}px`;
    root.style.transform = 'translateZ(0)';
  }

  function stopDrag() {
    if (!dragging || !root) return;
    dragging = false;
    chrome.storage.local.set({ ia_bar_pos: { left: root.style.left, top: root.style.top } });
  }

  function applyStoredPosition() {
    if (!root) return;
    if (!state.barPos?.left) {
      state.overlayVisible = true;
      return;
    }
    root.style.left = state.barPos.left;
    root.style.top = state.barPos.top;
    root.style.transform = 'translateZ(0)';
    state.overlayVisible = true;
  }

  function startBootstrap() {
    bootstrap().catch((e) => console.warn('[OpenSage] bootstrap', e));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startBootstrap);
  else startBootstrap();
})();
