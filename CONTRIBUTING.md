# Contributing to OpenSage

Thanks for considering a contribution. OpenSage is small on purpose, and the rules below keep it that way.

## What's welcome

- **Bug fixes** of any size. If something is broken, fix it.
- **New site extractors** — `site-detectors.js` for the detection logic, `content-extractor.js` for the universal fallback. If a site you use doesn't surface code well, add it.
- **New actions** — additional buttons in the overlay's action rows. Add the instruction string to `prompt-builder.js`'s `ACTION_INSTRUCTIONS`, add the button to `overlay-ui.js`, route it in `content.js`.
- **Prompt improvements** — terser, more accurate, better-formatted output. The current prompts live in `prompt-builder.js`. Empirical wins are great.
- **Documentation** — README clarifications, examples, screenshots.
- **Privacy hardening** — anything that reduces what the extension can see, sees less of, or sends elsewhere.

## What I'll probably not merge

- New dependencies, build steps, or transpilers. The "no build step, no node_modules" property is a feature.
- New `permissions` or `host_permissions` entries without a clear reason. The extension already asks for `<all_urls>` because the overlay is universal — adding more is a privacy-trust regression.
- Telemetry, analytics, or "phone home" code of any kind.
- A SaaS proxy in front of Anthropic. Calls go from the user's browser to `api.anthropic.com`, full stop.
- Frameworks (React / Vue / Svelte) for the popup or overlay. The overlay is ~600 lines of vanilla JS — keep it that way.

## How to develop

```bash
git clone https://github.com/ranjeet867/opensage.git
cd opensage
```

Load the folder as an unpacked extension at `chrome://extensions`. Edit any file. Reload the extension. Hard-reload (`Cmd/Ctrl+Shift+R`) any test page to pull in new content scripts.

There is no test suite at this point — manual testing on a couple of coding sites (LeetCode and one universal-fallback site like a random `<pre>` block on Stack Overflow) is the bar.

## Code style

- Vanilla JavaScript. No TypeScript, no JSX. (The codebase is small enough that types aren't pulling their weight; future contributors might disagree, in which case a JSDoc-only path would be the lowest-friction option.)
- 2-space indentation.
- Comments where intent isn't obvious. Don't comment what the code says — comment WHY.
- Module pattern: `window.IA_FOO = (() => { … return { … }; })()` — see existing files.

## Submitting a PR

1. Fork the repo.
2. Branch from `main`.
3. Commit with a sentence-form summary that's specific, e.g. `Add Codeforces extractor` or `Tighten Find Issues prompt to skip empty sections`.
4. Open a PR against `main`. Describe what changed, why, and what you tested.
5. Be patient — this is a side project, reviews aren't immediate.

## Reporting issues

Open a GitHub issue with:
- Browser + version (`chrome://version`).
- Site URL where it happened (or a minimal repro page).
- Console output (open DevTools → Console).
- What you expected vs. what happened.

## Security

If you find a security issue (e.g. a way the extension leaks data somewhere it shouldn't), please email instead of opening a public issue. Coordinated disclosure preferred.

## License

By contributing, you agree your contributions are licensed under the same [MIT License](LICENSE) the rest of the project uses.
