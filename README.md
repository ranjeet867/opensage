# OpenSage

> **An open-source AI coding companion that works on every website. Powered by your own Anthropic API key — your code never leaves your browser except to go directly to Anthropic.**

OpenSage is a Chrome / Chromium browser extension that adds a floating coaching overlay to any page that has code on it: LeetCode, HackerRank, GitHub, GitLab, Replit, CodeSandbox, StackBlitz, JSFiddle, your own localhost dev server, anything. Click a button, ask a question by voice or text, screenshot the screen — get back focused, structured technical help.

```
┌────────────────────────────────────────────────────────────┐
│  🧠 OpenSage                                  Listen  📸  ⚙ │
│ ─────────────────────────────────────────────────────────  │
│  Understand the current page / code                        │
│  [ Coach ] [ Explain ] [ Draft Code ] [ Complete ] [ How ] │
│                                                            │
│  Review & improve (auto-detects the language)              │
│  [ 🔍 Issues ] [ 🛡 Security ] [ ⚠ Errors ] [ ✨ Refactor ]│
│  [ 🏗 Sys Design ] [ 📸 Screenshot ]                       │
│                                                            │
│  Ask anything — works on every site…           [ Ask ]     │
└────────────────────────────────────────────────────────────┘
```

## Why this exists

Most AI coding assistants either:
- Live in your IDE only (great while coding, useless on LeetCode / docs / Stack Overflow / a YouTube tutorial),
- Live in a separate tab (you're constantly copy-pasting), or
- Are SaaS products that send your code through a third-party server.

OpenSage is none of those. It's an in-page overlay that:
- Reads the code/text already on whatever site you're on (no copy-paste).
- Calls Anthropic's API **directly from your browser** with **your** key — no middleman server.
- Runs on every Chromium browser (Chrome, Edge, Brave, Arc).

## Features

- **Universal** — works on every website, with optimized extractors for 25+ coding sites (LeetCode, HackerRank, GitHub, Replit, CodeSandbox, etc.) and a fallback that reads Monaco / CodeMirror / Ace / `<pre>` / `<textarea>` / `contenteditable`.
- **Auto-detect language** — never asks you what the code is in.
- **13 actions** — Coach · Explain · Draft Code · Complete · How To Use · Find Issues · Security · Error Handling · Refactor · Generate Tests · System Design · Voice Question · Screen Analysis.
- **Voice mode** — click Listen (browser's Web Speech API) and ask out loud. Works for visible-code questions ("explain this function") AND pure concept questions ("explain Kafka consumer groups", "init HashMap in Java").
- **Right-click on any selection** — highlight code, right-click, pick *"Explain this selection"* / *"Find bugs in selection"* / *"Generate tests for selection"* / *"How do I use this?"* / etc.
- **Screenshot the page** — `Ctrl+Shift+S` captures the visible tab, OCRs the code, and writes a complete working solution if the code is incomplete.
- **Auto-Scan** — optional toggle that re-reads the page every 12 seconds and refreshes guidance during a live coding session.
- **Keyboard shortcuts** — toggle / find issues / screenshot / ask, all bindable.
- **No telemetry, no analytics, no server** — your API key sits in `chrome.storage.local`, your code goes from your browser to `api.anthropic.com` and nowhere else.

## Install (from source — there's no Web Store listing yet)

1. Clone this repo:
   ```bash
   git clone https://github.com/REPLACE-WITH-YOUR-GITHUB/opensage.git
   cd opensage
   ```
2. Open Chrome (or Edge / Brave / Arc) and go to `chrome://extensions`.
3. Toggle **Developer mode** (top-right).
4. Click **Load unpacked** and select the cloned `opensage/` folder.
5. The OpenSage icon appears in your toolbar — click it.

## Get an Anthropic API key

OpenSage doesn't ship with a key (it's open source — anyone could grab it). You bring your own.

1. Go to <https://console.anthropic.com/>.
2. Sign up (or sign in). Free trial credit is included.
3. Top up a few dollars when the trial runs out — Claude Haiku, the default model, costs roughly **$0.001–0.005 per question** depending on length. A heavy day of use is well under $1.
4. Open <https://console.anthropic.com/settings/keys> and click **Create Key**.
5. Copy the key (starts with `sk-ant-…`).
6. Click the OpenSage icon in your toolbar → paste the key → **Save**.
7. Toggle **Enable OpenSage overlay** on.

You'll never see the prompt again on any site you visit until you turn it off.

## Keyboard shortcuts

| Action | Default |
|---|---|
| Toggle overlay | `Ctrl+Shift+Space` (or `MacCtrl+Shift+Space` on macOS) |
| Find issues / bugs | `Ctrl+Shift+I` |
| Screenshot tab & analyze | `Ctrl+Shift+S` |
| Submit typed question | `Ctrl+Enter` in the Ask box |

Re-bind any of them at `chrome://extensions/shortcuts`.

## Right-click on selected code

Highlight any code on a page, right-click, and pick from the **OpenSage** sub-menu — the highlighted snippet becomes the focus and the model ignores the surrounding noise:

- **Explain this selected code**
- **How do I use this?** — usage recipe for an API / library / language feature / data structure (`HashMap`, `useEffect`, `kafka consumer`, `defer`, `goroutine`, `asyncio`, …)
- **Find bugs in selection**
- **Optimize / refactor selection**
- **Generate unit tests for selection**
- **Complete this selected code**
- **Ask anything about selection…** — drops the snippet in the prompt box and waits for your question

## Voice mode — "Listen"

Click **Listen** and speak your question. Works for:

- Visible-code questions: *"is this loop O(n) or O(n²)?"*, *"is line 42 a race condition?"*
- Pure concept questions: *"explain Kafka consumer groups"*, *"how do I init a HashMap in Java?"*, *"what's the difference between BFS and DFS?"*

Voice uses the browser's built-in `SpeechRecognition` API (Chrome streams to Google's STT service, Edge streams to Microsoft's). Free for the user, no extra API key.

## Where it works

**Optimized for:** LeetCode, HackerRank, CodeSignal, GeeksforGeeks, InterviewBit, CodeChef, Codeforces, AtCoder, HackerEarth, Coding Ninjas, Exercism, freeCodeCamp, Codewars, CoderPad, Codility, TestDome, Kattis, TopCoder, SPOJ, Pramp, GitHub, GitLab, Replit, CodeSandbox, StackBlitz, CodePen, JSFiddle, VS Code Web, the Go / Rust / TypeScript playgrounds, localhost dev servers.

**Fallback** for any other site: a universal extractor that reads Monaco, CodeMirror v5/v6, Ace, Prism / highlight.js, plain `<textarea>`, `contenteditable`, and bare `<pre>` / `<code>` blocks.

## Privacy

- Your Anthropic API key is stored **only** in `chrome.storage.local` on your device. Never sent anywhere except as the `x-api-key` header to `https://api.anthropic.com`.
- Code extracted from the page goes directly from your browser to Anthropic. There is no OpenSage server. There is no telemetry. There is no analytics.
- The voice feature uses the browser's built-in `SpeechRecognition` API. In Chrome, that means audio passes through Google's speech-to-text servers (a Chromium implementation detail — same path any web app using Web Speech goes through). If that's not acceptable, don't click Listen.
- The extension requests `<all_urls>` because the overlay is universal — it has to be able to inject on every site you choose to use it on. It does NOT make any network requests except to `api.anthropic.com`.

## How it's built

| Layer | What it does | File |
|---|---|---|
| `manifest.json` | Manifest V3 declaration, permissions, content scripts, hotkeys, context menus | `manifest.json` |
| Content script | Mounts the overlay, reads the page DOM, routes user actions | `content.js` |
| Page extractors | Site-specific code readers (LeetCode, HackerRank, etc.) + universal fallback | `site-detectors.js`, `content-extractor.js` |
| Overlay UI | The floating panel HTML + interactions | `overlay-ui.js`, `overlay.css` |
| Prompt builder | Translates "Find Issues" / "Refactor" / etc. into structured Anthropic prompts | `prompt-builder.js` |
| Background worker | Tab capture (`chrome.tabs.captureVisibleTab`), context menus, hotkeys | `background.js` |
| Voice | Browser `SpeechRecognition` wrapper | `audio-handler.js` |
| Popup | Settings UI (paste API key, toggle overlay, choose model) | `popup.html`, `popup.js` |

About 1500 lines of vanilla JS — no build step, no bundler, no node_modules. You can read the entire codebase in an evening.

## Development

```bash
git clone https://github.com/REPLACE-WITH-YOUR-GITHUB/opensage.git
cd opensage
# 1. Make your changes (edit any .js / .css / .html)
# 2. Reload the extension at chrome://extensions
# 3. Hard-reload any open page (Cmd/Ctrl+Shift+R) to pick up new content scripts
```

There is no build step. The code in the repo is the code that runs.

For prompt experiments, the action instructions live in `prompt-builder.js` under `ACTION_INSTRUCTIONS`. Tweak any of them, reload, observe.

## Roadmap

Ideas welcome — open an issue or PR. Known wishlist:

- [ ] Settings UI for picking model (Haiku / Sonnet / Opus) per action
- [ ] Local-only voice via Whisper.cpp (no Google round-trip)
- [ ] Firefox port (Manifest V3 differences)
- [ ] Tab-audio capture for transcribing video calls (Meet/Zoom) directly
- [ ] Markdown export of the answer history per session
- [ ] Theme switcher (light / dark / matches system)
- [ ] Per-site rules (auto-disable on banking / healthcare domains)

## Contributing

Pull requests welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). The bar is roughly:

1. Code reads like the rest of the file (vanilla JS, no frameworks, comments where intent isn't obvious).
2. No new dependencies (the whole thing being build-step-free is a feature).
3. Permissions: don't add any `host_permissions` or new `permissions` entries without a strong reason.
4. Test on at least one coding site (LeetCode is fine) before opening the PR.

## Honest use

OpenSage is for **learning, teaching, building, and working on your own code**. It's not for proctored exams, technical interviews where you've agreed not to use external assistance, or content owned by other people you don't have permission to feed to an LLM. The technical capability does not change what you've committed to.

## License

[MIT](LICENSE) — do whatever you want with this, just keep the copyright notice. No warranty.

## Acknowledgements

OpenSage started as a private tool called CodeSage Pro and was open-sourced after being battle-tested. Thanks to everyone who kicked the tires before this hit GitHub.
