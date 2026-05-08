document.addEventListener('DOMContentLoaded', async () => {
  const input  = document.getElementById('key-input');
  const btn    = document.getElementById('save-btn');
  const msg    = document.getElementById('msg');
  const badge  = document.getElementById('badge');
  const enabledToggle = document.getElementById('enabled-toggle');
  const audioAssist = document.getElementById('audio-assist');
  const speakResults = document.getElementById('speak-results');
  const largeText = document.getElementById('large-text');
  const highContrast = document.getElementById('high-contrast');
  const toggleOverlay = document.getElementById('toggle-overlay');
  const testPermissions = document.getElementById('test-permissions');
  const statusNodes = {
    microphone: document.getElementById('status-microphone'),
    tab: document.getElementById('status-tab'),
    api: document.getElementById('status-api'),
    page: document.getElementById('status-page'),
    classification: document.getElementById('status-classification'),
    active: document.getElementById('status-active')
  };

  const s = await chrome.storage.local.get([
    'ia_api_key',
    'ia_enabled',
    'ia_audio_assist',
    'ia_speak_results',
    'ia_large_text',
    'ia_high_contrast'
  ]);
  if (s.ia_api_key) { input.value = s.ia_api_key; badge.classList.add('show'); }
  enabledToggle.checked = !!s.ia_enabled;
  audioAssist.checked = !!s.ia_audio_assist;
  speakResults.checked = !!s.ia_speak_results;
  largeText.checked = !!s.ia_large_text;
  highContrast.checked = !!s.ia_high_contrast;
  refreshStatus();

  input.addEventListener('dblclick', () => {
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  btn.addEventListener('click', save);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });

  [enabledToggle, audioAssist, speakResults, largeText, highContrast].forEach((checkbox) => {
    checkbox.addEventListener('change', savePreferences);
  });

  toggleOverlay.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_OVERLAY' }).catch(() => {});
    window.close();
  });

  testPermissions.addEventListener('click', refreshStatus);

  async function save() {
    const key = input.value.trim();
    if (!key) { show('Please enter your API key.', 'err'); return; }
    if (!key.startsWith('sk-ant-')) { show('Invalid key format — should start with sk-ant-', 'err'); return; }

    btn.textContent = 'Verifying…';
    btn.disabled = true;

    try {
      const ok = await verify(key);
      if (!ok) throw new Error('Invalid key');
      await chrome.storage.local.set({ ia_api_key: key });
      chrome.runtime.sendMessage({ type: 'API_KEY_SAVED', key });
      show('✓ API key saved!', 'ok');
      badge.classList.add('show');
      refreshStatus();
    } catch {
      show('Key rejected. Check it at console.anthropic.com', 'err');
    } finally {
      btn.textContent = 'Save';
      btn.disabled = false;
    }
  }

  async function verify(key) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 5, messages: [{ role: 'user', content: 'hi' }] })
      });
      return r.ok;
    } catch { return false; }
  }

  async function updateSettings(payload) {
    await chrome.storage.local.set(payload);
    await chrome.runtime.sendMessage({ type: 'UPDATE_SETTINGS', payload });
  }

  async function savePreferences() {
    const enabledNow = enabledToggle.checked;
    await updateSettings({
      ia_enabled: enabledNow,
      ia_audio_assist: audioAssist.checked,
      ia_speak_results: speakResults.checked,
      ia_large_text: largeText.checked,
      ia_high_contrast: highContrast.checked
    });
    // When the user disables the overlay, force-hide it on every open tab
    // immediately — don't wait on per-tab storage listeners.
    if (!enabledNow) {
      chrome.runtime.sendMessage({ type: 'BROADCAST_DISABLE' }).catch(() => {});
    }
    refreshStatus();
  }

  async function refreshStatus() {
    const micPermission = await getMicrophonePermission();
    const tabStatus = await chrome.runtime.sendMessage({ type: 'GET_TAB_STATUS' }).catch(() => null);

    setStatus(statusNodes.microphone, micPermission.label, micPermission.kind);
    setStatus(statusNodes.tab, tabStatus?.hasTabAccess ? 'Ready' : 'Missing', tabStatus?.hasTabAccess ? 'good' : 'bad');
    setStatus(statusNodes.api, tabStatus?.apiKeyConfigured ? 'Configured' : 'Missing', tabStatus?.apiKeyConfigured ? 'good' : 'bad');
    setStatus(
      statusNodes.page,
      tabStatus?.siteLabel || 'Unknown page',
      'good'
    );
    const classification = tabStatus?.classification || 'Universal';
    const classKind = /Coding Practice|Code Editor/.test(classification) ? 'good' : 'warn';
    setStatus(statusNodes.classification, classification, classKind);
    setStatus(
      statusNodes.active,
      tabStatus?.practiceActive ? 'Active' : 'Inactive',
      tabStatus?.practiceActive ? 'good' : 'warn'
    );
  }

  async function getMicrophonePermission() {
    if (!navigator.permissions?.query) return { label: 'Unknown', kind: 'warn' };
    try {
      const permission = await navigator.permissions.query({ name: 'microphone' });
      const map = {
        granted: { label: 'Granted', kind: 'good' },
        denied: { label: 'Denied', kind: 'bad' },
        prompt: { label: 'Prompt', kind: 'warn' }
      };
      return map[permission.state] || { label: permission.state, kind: 'warn' };
    } catch {
      return { label: 'Unknown', kind: 'warn' };
    }
  }

  function setStatus(node, text, kind) {
    node.textContent = text;
    node.className = `status-value status-${kind}`;
  }

  function show(text, type) {
    msg.textContent = text;
    msg.className = `msg ${type}`;
    setTimeout(() => { msg.className = 'msg'; }, 3500);
  }
});
