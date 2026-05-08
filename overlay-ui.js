// OpenSage — overlay UI
// Layout:
//   bar:    logo + title + mode badge + status + listen + scan + hide
//   panel:  two rows of quick action pills
//           row 1 (understanding): Coach · Explain · Code · Complete
//           row 2 (review):       Find Issues · Security · Errors · Refactor · Detect Lang · Screenshot
//           prompt row + answers + footer

window.IA_OVERLAY_UI = (() => {
  function createOverlay() {
    const root = document.createElement('div');
    root.id = 'ia-root';
    root.innerHTML = `
      <div id="ia-bar">
        <div id="ia-bar-left">
          <span id="ia-logo" title="OpenSage">CS</span>
          <div id="ia-title-wrap">
            <div id="ia-title">OpenSage</div>
            <div id="ia-mode-badge">—</div>
          </div>
          <span id="ia-status-label" class="ia-bar-status">Ready</span>
        </div>
        <div id="ia-bar-actions">
          <button class="ia-pill" id="ia-listen-btn" title="Voice mode — speak your prompt instead of typing">
            <span class="ia-pill-dot"></span><span>Listen</span>
          </button>
          <button class="ia-pill" id="ia-scan-btn" title="Auto-Scan — every 12 sec, re-read the page (or shared screen) and refresh guidance. Best for live coding sessions / interviews / pair-screen-shares.">Auto-Scan</button>
          <button id="ia-min-btn" title="Minimize overlay (Ctrl+Shift+Space to toggle)">–</button>
          <button id="ia-hide-btn" title="Hide overlay (Ctrl+Shift+Space)">×</button>
        </div>
      </div>
      <div id="ia-panel">
        <div id="ia-quick-actions" class="ia-group-row">
          <div class="ia-group">
            <span class="ia-group-label">Understand the current page / code</span>
            <div class="ia-group-buttons">
              <button class="ia-secondary" data-action="coach"    title="Walk me through the visible problem step by step">Coach</button>
              <button class="ia-secondary" data-action="explain"  title="Explain what the visible code or problem is doing in plain English">Explain</button>
              <button class="ia-secondary" data-action="code"     title="Draft a clean solution for the visible problem">Draft Code</button>
              <button class="ia-secondary" data-action="complete" title="Complete the function I'm currently writing">Complete</button>
            </div>
          </div>
          <div class="ia-group">
            <span class="ia-group-label">Review &amp; improve (every action auto-detects the language)</span>
            <div class="ia-group-buttons">
              <button class="ia-secondary" data-action="findIssues"     title="Find bugs, off-by-ones, edge cases — with file/line refs">🔍 Issues</button>
              <button class="ia-secondary" data-action="security"       title="Security review — injections, secrets, unsafe APIs, with line refs">🛡 Security</button>
              <button class="ia-secondary" data-action="errorHandling"  title="Audit error handling, missing try/catch, swallowed errors">⚠ Errors</button>
              <button class="ia-secondary" data-action="refactor"       title="Refactor for readability, idiomatic style, performance">✨ Refactor</button>
              <button class="ia-secondary" data-action="systemDesign"   title="Design a production system end-to-end. Cloud-agnostic. Covers requirements, architecture, API, data model, storage, caching, replication, scaling 10K → 100K → 1M → 10M users, Kubernetes deployment, failure modes, cost, trade-offs.">🏗 Sys Design</button>
              <button class="ia-secondary" id="ia-snap-btn"             title="Take a screenshot of this tab (great for video calls / shared screens) and analyze the IDE: bugs, security, optimizations, what to write next — with line numbers + function names">📸 Screenshot</button>
            </div>
          </div>
        </div>
        <div id="ia-prompt-row" class="ia-prompt-row" title="Ask anything — it intelligently uses the current code, this page, or a screenshot when you mention 'this', 'screen', 'current', etc.">
          <textarea id="ia-prompt" rows="1" placeholder="Ask anything — e.g. ‘how to improve the current function on screen?’"></textarea>
          <button type="button" id="ia-ask-btn" title="Ask AI — automatically reads the current page or screenshot when needed">Ask</button>
        </div>
        <div id="ia-output-bar">
          <button type="button" id="ia-clear-btn" title="Clear all replies">Clear</button>
        </div>
        <div id="ia-answers"></div>
        <div id="ia-panel-footer">
          <span class="ia-foot" id="ia-footer-tok">0 tokens</span>
          <span class="ia-foot" id="ia-footer-state">Inactive</span>
          <span class="ia-foot ia-brand-foot">OpenSage</span>
        </div>
      </div>
    `;
    document.body.appendChild(root);
    return root;
  }

  return { createOverlay };
})();
