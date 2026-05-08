// OpenSage — background service worker
// Every site is supported. This worker bridges the popup, the
// content script, tab-capture and keyboard commands.

const LABELS = {
  codingPractice: 'Coding Practice',
  assessment:     'Assessment / Proctored',
  genericCoding:  'Code Editor',
  reading:        'Documentation / Article',
  meeting:        'Meeting / Video',
  universal:      'Universal'
};

const MATCHERS = [
  { group: 'codingPractice', id: 'leetcode',      label: 'LeetCode',        test: (u) => /(^|\.)leetcode\.(com|cn)$/.test(u.hostname) },
  { group: 'codingPractice', id: 'hackerrank',    label: 'HackerRank',      test: (u) => /(^|\.)hackerrank\.com$/.test(u.hostname) },
  { group: 'codingPractice', id: 'codesignal',    label: 'CodeSignal',      test: (u) => /(^|\.)codesignal\.(com|io)$/.test(u.hostname) },
  { group: 'codingPractice', id: 'hackerearth',   label: 'HackerEarth',     test: (u) => /(^|\.)hackerearth\.com$/.test(u.hostname) },
  { group: 'codingPractice', id: 'codechef',      label: 'CodeChef',        test: (u) => /(^|\.)codechef\.com$/.test(u.hostname) },
  { group: 'codingPractice', id: 'codeforces',    label: 'Codeforces',      test: (u) => /(^|\.)codeforces\.com$/.test(u.hostname) },
  { group: 'codingPractice', id: 'atcoder',       label: 'AtCoder',         test: (u) => /(^|\.)atcoder\.jp$/.test(u.hostname) },
  { group: 'codingPractice', id: 'interviewbit',  label: 'InterviewBit',    test: (u) => /(^|\.)interviewbit\.com$/.test(u.hostname) },
  { group: 'codingPractice', id: 'geeksforgeeks', label: 'GeeksforGeeks',   test: (u) => /(^|\.)geeksforgeeks\.org$/.test(u.hostname) },
  { group: 'codingPractice', id: 'codingninjas',  label: 'Coding Ninjas',   test: (u) => /(^|\.)codingninjas\.com$/.test(u.hostname) },
  { group: 'codingPractice', id: 'exercism',      label: 'Exercism',        test: (u) => /(^|\.)exercism\.(io|org)$/.test(u.hostname) },
  { group: 'codingPractice', id: 'freecodecamp',  label: 'freeCodeCamp',    test: (u) => /(^|\.)freecodecamp\.org$/.test(u.hostname) },
  { group: 'codingPractice', id: 'codewars',      label: 'Codewars',        test: (u) => /(^|\.)codewars\.com$/.test(u.hostname) },
  { group: 'codingPractice', id: 'coderpad',      label: 'CoderPad',        test: (u) => /(^|\.)coderpad\.io$/.test(u.hostname) },
  { group: 'codingPractice', id: 'codility',      label: 'Codility',        test: (u) => /(^|\.)codility\.com$/.test(u.hostname) },
  { group: 'codingPractice', id: 'localhost',     label: 'Localhost',       test: (u) => /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(u.hostname) },
  { group: 'genericCoding',  id: 'github',        label: 'GitHub',          test: (u) => /(^|\.)github\.com$/.test(u.hostname) },
  { group: 'genericCoding',  id: 'gitlab',        label: 'GitLab',          test: (u) => /(^|\.)gitlab\.com$/.test(u.hostname) },
  { group: 'genericCoding',  id: 'stackblitz',    label: 'StackBlitz',      test: (u) => /(^|\.)stackblitz\.com$/.test(u.hostname) },
  { group: 'genericCoding',  id: 'codesandbox',   label: 'CodeSandbox',     test: (u) => /(^|\.)codesandbox\.io$/.test(u.hostname) },
  { group: 'genericCoding',  id: 'replit',        label: 'Replit',          test: (u) => /(^|\.)replit\.com$/.test(u.hostname) },
  { group: 'genericCoding',  id: 'codepen',       label: 'CodePen',         test: (u) => /(^|\.)codepen\.io$/.test(u.hostname) },
  { group: 'genericCoding',  id: 'jsfiddle',      label: 'JSFiddle',        test: (u) => /(^|\.)jsfiddle\.net$/.test(u.hostname) },
  { group: 'genericCoding',  id: 'go-playground', label: 'Go Playground',   test: (u) => /play\.golang\.org$/.test(u.hostname) || /(^|\.)go\.dev$/.test(u.hostname) },
  { group: 'meeting',        id: 'google-meet',   label: 'Google Meet',     test: (u) => /meet\.google\.com$/.test(u.hostname) },
  { group: 'meeting',        id: 'zoom',          label: 'Zoom',            test: (u) => /(^|\.)zoom\.us$/.test(u.hostname) },
  { group: 'meeting',        id: 'teams',         label: 'Microsoft Teams', test: (u) => /teams\.microsoft\.com$/.test(u.hostname) }
];

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  if (command === 'toggle-overlay')       send(tab.id, { type: 'TOGGLE_OVERLAY' });
  if (command === 'find-issues')          send(tab.id, { type: 'QUICK_ACTION', action: 'findIssues' });
  if (command === 'capture-screenshot') {
    const dataUrl = await capture();
    if (dataUrl) send(tab.id, { type: 'CAPTURE_SS', dataUrl });
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'CAPTURE_TAB') {
    capture().then((dataUrl) => sendResponse({ dataUrl }))
             .catch((e) => sendResponse({ error: e.message }));
    return true;
  }
  if (msg.type === 'GET_TAB_STATUS') {
    getActiveTabStatus().then(sendResponse)
                       .catch((error) => sendResponse({ error: error.message }));
    return true;
  }
  if (msg.type === 'GET_SETTINGS') {
    chrome.storage.local.get(null).then((data) => sendResponse(data));
    return true;
  }
  if (msg.type === 'UPDATE_SETTINGS') {
    chrome.storage.local.set(msg.payload || {}).then(() => broadcast({ type: 'SETTINGS_UPDATED' }));
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'API_KEY_SAVED') {
    chrome.storage.local.set({ ia_api_key: msg.key });
    broadcast({ type: 'SETTINGS_UPDATED' });
    sendResponse({ ok: true });
    return true;
  }
  if (msg.type === 'BROADCAST_DISABLE') {
    // Tell every open tab to immediately tear the overlay down.
    // Use lightweight sendMessage only — no script injection — because
    // tabs that never had the script don't need an overlay to remove.
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((t) => {
        if (!t.id) return;
        chrome.tabs.sendMessage(t.id, { type: 'FORCE_HIDE_OVERLAY' }).catch(() => {});
      });
    });
    sendResponse({ ok: true });
    return true;
  }
  return true;
});

async function capture() {
  try {
    const w = await chrome.windows.getCurrent();
    return await chrome.tabs.captureVisibleTab(w.id, { format: 'jpeg', quality: 80 });
  } catch {
    return null;
  }
}

function send(tabId, msg) {
  chrome.tabs.sendMessage(tabId, msg).catch(() => {
    chrome.scripting.executeScript({
      target: { tabId },
      files: ['site-detectors.js','content-extractor.js','audio-handler.js','prompt-builder.js','overlay-ui.js','content.js']
    }).then(() => chrome.scripting.insertCSS({ target: { tabId }, files: ['overlay.css'] }))
      .then(() => setTimeout(() => chrome.tabs.sendMessage(tabId, msg).catch(() => {}), 350))
      .catch(() => {});
  });
}

function broadcast(msg) {
  chrome.tabs.query({}, (tabs) => tabs.forEach((t) => t.id && send(t.id, msg)));
}

chrome.runtime.onInstalled.addListener(() => {
  try { chrome.contextMenus.removeAll(() => setupMenus()); }
  catch (_) { setupMenus(); }
});

function setupMenus() {
  const addPage = (id, title) => {
    try { chrome.contextMenus.create({ id, title, contexts: ['page'] }); } catch (_) {}
  };
  const addSel = (id, title) => {
    try { chrome.contextMenus.create({ id, title, contexts: ['selection'] }); } catch (_) {}
  };

  // Page-level (no selection required)
  addPage('cs-toggle',   'OpenSage: Toggle overlay');
  addPage('cs-snap',     'OpenSage: Analyze screenshot (capture & solve)');
  addPage('cs-issues',   'OpenSage: Find issues in this page');
  addPage('cs-security', 'OpenSage: Security review of this page');
  addPage('cs-refactor', 'OpenSage: Refactor / improve this page');

  // Selection-only — appear ONLY when the user has highlighted text/code.
  // These send the selection straight into the AI as the primary focus.
  addSel('cs-sel-explain',  'OpenSage: Explain this selected code');
  addSel('cs-sel-howto',    'OpenSage: How do I use this? (API / library / language feature)');
  addSel('cs-sel-bugs',     'OpenSage: Find bugs in selection');
  addSel('cs-sel-optimize', 'OpenSage: Optimize / refactor selection');
  addSel('cs-sel-tests',    'OpenSage: Generate unit tests for selection');
  addSel('cs-sel-complete', 'OpenSage: Complete this selected code');
  addSel('cs-sel-ask',      'OpenSage: Ask anything about selection…');
}

const SELECTION_ACTIONS = {
  'cs-sel-explain':  'selection',
  'cs-sel-howto':    'howto',
  'cs-sel-bugs':     'findIssues',
  'cs-sel-optimize': 'refactor',
  'cs-sel-tests':    'tests',
  'cs-sel-complete': 'complete',
  'cs-sel-ask':      'selection'
};

chrome.contextMenus?.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  // Page-level handlers
  if (info.menuItemId === 'cs-toggle')   return send(tab.id, { type: 'TOGGLE_OVERLAY' });
  if (info.menuItemId === 'cs-issues')   return send(tab.id, { type: 'QUICK_ACTION', action: 'findIssues' });
  if (info.menuItemId === 'cs-security') return send(tab.id, { type: 'QUICK_ACTION', action: 'security' });
  if (info.menuItemId === 'cs-refactor') return send(tab.id, { type: 'QUICK_ACTION', action: 'refactor' });
  if (info.menuItemId === 'cs-snap') {
    const dataUrl = await capture();
    if (dataUrl) send(tab.id, { type: 'CAPTURE_SS', dataUrl });
    return;
  }

  // Selection-level handlers
  const selAction = SELECTION_ACTIONS[info.menuItemId];
  if (selAction) {
    const text = (info.selectionText || '').trim();
    return send(tab.id, {
      type: 'SELECTION_ACTION',
      action: selAction,
      selection: text,
      promptUser: info.menuItemId === 'cs-sel-ask'
    });
  }
});

async function getActiveTabStatus() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const settings = await chrome.storage.local.get(['ia_api_key','ia_enabled']);
  const support = detectSite(tab?.url || '');
  return {
    tabId: tab?.id || null,
    hasTabAccess: Boolean(tab?.id),
    apiKeyConfigured: Boolean(settings.ia_api_key),
    practiceActive: Boolean(settings.ia_enabled), // always-on when enabled
    supportedPage: support.supported,
    siteLabel: support.siteLabel,
    classification: support.classification,
    pageReason: support.reason,
    pageUrl: tab?.url || ''
  };
}

function detectSite(href) {
  try {
    const url = new URL(href);
    const match = MATCHERS.find((m) => m.test(url));
    if (match) {
      return {
        supported: true,
        siteLabel: match.label,
        classification: LABELS[match.group],
        reason: `matched-${match.group}`
      };
    }
    return {
      supported: true, // universal support
      siteLabel: `Web — ${url.hostname}`,
      classification: LABELS.universal,
      reason: 'universal-fallback'
    };
  } catch {
    return { supported: false, siteLabel: 'Unknown page', classification: LABELS.universal, reason: 'invalid-url' };
  }
}
