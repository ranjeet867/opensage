// OpenSage — prompt builder
// One entry-point: buildActionPrompt(action, context, userText).
// Actions: coach, explain, code, improve, complete, findIssues,
// security, errorHandling, refactor, voice, screen,
// howto (API / language-feature usage), tests (unit-test gen),
// selection (focus on highlighted code).

window.IA_PROMPTS = (() => {
  const ACTION_INSTRUCTIONS = {
    coach:         'Coach me through the visible problem. Auto-detect the language. Give the best approach and next concrete step. Reference function/class names + line numbers when pointing at the code.',
    explain:       'Auto-detect the language. Explain the problem and any visible code in plain English. If the page has a left/right split (problem on the left, code editor on the right), use both.',
    code:          'Auto-detect the language from the visible code or problem. Draft a clean, correct solution. Include time & space complexity.',
    improve:       'Auto-detect the language. Improve the current code. Call out bugs, inefficiencies, edge cases, with `funcName() L<line>` references.',
    complete:      'Auto-detect the language. Complete only the missing parts of the visible code based on the function signature and problem. Do not rewrite working code.',
    findIssues:    'Act as a senior code reviewer. Auto-detect the language. Find correctness bugs, edge-case failures, logic errors, off-by-one mistakes, null/undefined risks, race conditions, incorrect complexity. Group: Critical / High / Medium. For each: `funcName() L<line>` → bug → fix block.',
    security:      'Act as a security engineer. Auto-detect the language. Review for injection, XSS, SSRF, path traversal, deserialization, insecure crypto, hardcoded secrets, unsafe eval, broken authz, TOCTOU, prototype pollution. Severity-rate (Critical / High / Medium / Low) with `funcName() L<line>` and remediation code.',
    errorHandling: 'Auto-detect the language. Audit error-handling: unhandled failure paths, swallowed exceptions, missing timeouts/retries, unchecked nulls, resource leaks. Cite `funcName() L<line>`. Output a robust rewritten snippet using idiomatic patterns for that language.',
    refactor:      'Auto-detect the language. Refactor for readability, idiomatic style, performance, testability — behavior identical. Output the full refactored code plus a short bullet list of what changed and why, with line refs.',
    howto:         'Show how to USE the API / library / language feature / data structure mentioned (e.g. `HashMap`, `kafka consumer`, `useEffect`, `defer`, `goroutine`, `asyncio`). Auto-detect the language from the selection or page context. Output: 1-line "what it is", a minimal idiomatic init/usage snippet, the 2-3 most common patterns (with code), 2-3 common mistakes, and 1 alternative when relevant.',
    tests:         'Generate a focused unit-test suite for the given code. Auto-detect the language and pick the idiomatic framework (jest/vitest, pytest, junit, go test, rspec, xctest, etc.). Cover happy path, 2-3 edge cases, 1 negative / error case, and any boundary conditions visible in the function signature.',
    selection:     'Treat the selected snippet as the focus. Auto-detect the language. Explain it briefly (1-2 lines), then give the most useful response: completion if it is incomplete, fix if it is buggy, idiomatic rewrite if it is awkward, or a usage example if it is an API/type. Stay tight.',
    voice:         'Auto-detect the language. Answer the spoken question directly. The question may be about visible code OR a pure concept (e.g. "explain Kafka consumer groups", "how do I init a HashMap in Java", "what is a mutex", "difference between BFS and DFS"). For concept questions, give a tight definition + minimal code example + 1 common pitfall — do NOT force-fit page context if it is unrelated.',
    screen:        'Auto-detect the language from the screenshot. If the screenshot shows INCOMPLETE code (unfinished function, missing return, TODO/PASS stub, blank body, partial expression), WRITE THE FULL WORKING SOLUTION inside a fenced code block. If the screenshot shows a problem statement without code, DRAFT A CLEAN SOLUTION. Otherwise summarize and guide. Always cite `funcName() L<line>` references when pointing at the visible code.',
    systemDesign:  'Act as a senior staff engineer designing a production system. Be cloud-agnostic by default (call out AWS/GCP/Azure-specific options only as examples). Cover: (1) Functional + non-functional requirements with explicit scale numbers (users, RPS, data volume, p99 latency targets, durability, RPO/RTO). (2) High-level architecture, every component named. (3) API contract sketch (REST / gRPC / GraphQL endpoints with sample payloads). (4) Data model — entities, indexes, partitioning / sharding key, hot-key mitigation. (5) Storage choices with rationale (Postgres vs Cassandra vs DynamoDB vs S3 vs Redis vs Elastic vs Kafka vs ClickHouse). (6) Caching strategy (CDN, edge, app-side, DB read-through, write-through, invalidation). (7) Replication & consistency (sync vs async, multi-region, leader-follower vs leaderless, CAP/PACELC trade-offs). (8) Scaling story with concrete numbers: 10K → 100K → 1M → 10M users — what changes at each step. (9) Deployment topology — Kubernetes cluster shape (node pools, HPA, PDB), service mesh, ingress, secrets, observability (metrics / logs / traces). (10) Failure modes — what happens if X dies. (11) Cost ballpark per million users. (12) Trade-offs you DELIBERATELY chose against. Use small fenced code blocks for API examples, schemas, and configs. Use ## headings for each section so it formats cleanly.'
  };

  function buildActionPrompt(action, context, spokenPrompt = '') {
    const userText = String(spokenPrompt || '').trim();
    const hasUserAsk = userText.length > 0;
    const isVoice = action === 'voice';
    const selection = String(context.selection || '').trim();
    const hasSelection = selection.length > 0;

    const system = buildSystem(action, hasUserAsk, isVoice, hasSelection);

    const summaryLimit     = hasUserAsk ? 300 : 400;
    const constraintsLimit = hasUserAsk ? 260 : 380;
    const codeLimit        = hasUserAsk ? 1600 : 2800;
    const cursorLimit      = hasUserAsk ? 500  : 800;
    const selectionLimit   = 2200;

    const userParts = [];

    if (hasSelection) {
      // Selection always wins — it's what the user explicitly highlighted.
      userParts.push(
        'PRIMARY FOCUS — the user highlighted this and right-clicked:',
        '```',
        trimBlock(selection, selectionLimit),
        '```',
        ''
      );
    }

    if (hasUserAsk) {
      userParts.push(
        hasSelection
          ? 'User request about the selection (answer this directly):'
          : 'User request (answer this first, directly — no lecture, no refocusing):',
        userText,
        '',
        'Optional page context (use only if it helps):'
      );
    } else {
      userParts.push(ACTION_INSTRUCTIONS[action] || ACTION_INSTRUCTIONS.coach, '');
    }

    userParts.push(
      `Site: ${context.siteLabel || 'Unknown'}`,
      `Title: ${context.title || 'Unknown'}`,
      `Language (detected): ${context.language || 'Unknown'}`,
      '',
      'Short summary of the page:',
      trimBlock(context.summaryCompact || context.summary, summaryLimit) || 'No summary available.',
      '',
      'Key constraints (if any):',
      trimBlock(context.constraints, constraintsLimit) || 'None found.',
      '',
      hasSelection
        ? 'Surrounding code on the page (background only — focus stays on the selection above):'
        : 'Current code (from the editor / page):',
      trimBlock(context.code, codeLimit) || 'No code extracted.',
      '',
      'Cursor-near context (if available):',
      trimBlock(context.cursorContext, cursorLimit) || 'None.'
    );

    return { system, user: userParts.join('\n') };
  }

  function buildSystem(action, hasUserAsk, isVoice, hasSelection) {
    const base = [
      'You are OpenSage — a concise, general-purpose senior engineering assistant.',
      'You help anyone, on any site or IDE, with any task: explaining code, building features, completing functions, reviewing for bugs / security / errors / performance, generating new code, or answering free-form technical questions.',
      'Always auto-detect the programming language and framework from the visible code, file extension, or page hints. Never ask the user what language it is.',
      'When pointing at code, reference the function/class name and line number (e.g. `parseInput() L14`).',
      'If the page has a split layout (problem on the left, editor on the right; or shared screen with IDE), combine both sides.',
      'Answer the user\'s actual question directly. Do not refuse, scold, or refocus unless they only asked about the visible problem.',
      'Do not repeat the full problem statement back if it is likely visible on screen.',
      'Prefer: short answer first, then steps / code only when useful.',
      'Use GitHub-flavored markdown and fenced code blocks with language tags.',
      'If context is weak, say so in ONE line — then still answer as best you can.',
      'Never invent API facts. If unsure, say so.',
      'Sanity-check before you state a claim: trace through with the ACTUAL values, characters, indices, or types shown in the code. If you assert a numeric/string/ASCII conversion, a complexity, a return value, an off-by-one, or an edge-case behavior, mentally run the snippet first and confirm. Prefer "this could fail when X" over a confident wrong claim — when uncertain, say "I am not 100% sure" in one line and explain what would confirm it.',
      'Do not flag correct code as buggy. Before reporting a bug, restate what the code actually does in one line and confirm it disagrees with the intended behavior.'
    ];

    const perAction = {
      findIssues:    'Structure: "Critical", "High", "Medium" sections; each issue: `funcName() L<line>` → bug → why → fix block.',
      security:      'Structure: severity-rated findings, CWE / OWASP tag when relevant, `funcName() L<line>`, root cause, remediation code.',
      errorHandling: 'Structure: failure paths, swallowed exceptions, missing timeouts/retries, resource leaks (each with `funcName() L<line>`), then a fully rewritten robust version.',
      refactor:      'Output the fully refactored code in a single fenced block, then a short bullet list of what changed (with line refs).',
      code:          'Default format: Approach → Complexity → Code → Edge cases.',
      improve:       'Point out concrete bugs first, then optimisations, then polish — all with `funcName() L<line>`.',
      complete:      'Only complete the missing parts — do not rewrite what the user already wrote.',
      howto:         'Format: "What it is" (1 line) → "Init / minimal usage" (fenced code) → "Common patterns" (2-3 small fenced blocks) → "Common mistakes" (bullets) → "When to use something else" (1 line).',
      tests:         'Output a single fenced code block with the test file. Name tests after behavior, not implementation. Include necessary imports, fixtures, mocks. End with a 1-line note on what is intentionally NOT covered.',
      selection:     'Stay laser-focused on the highlighted snippet. Do not analyze unrelated code on the page. If asked something general, answer in the context of that snippet.',
      screen:        'If you see incomplete code in the screenshot, output the FULL working solution in a fenced block — do not just describe what to do.'
    };

    if (perAction[action]) base.push(perAction[action]);

    if (hasSelection) {
      base.push('The user highlighted a specific snippet on the page and right-clicked. Treat that snippet as the primary subject of your response. Other extracted code is background context only.');
    }

    if (isVoice || hasUserAsk) {
      base.push('Voice input is transcribed by the browser and often mis-hears technical terms — infer intended words (Kubernetes, gRPC, LeetCode, mutex, O(n), deque, pytest, HashMap, ConcurrentHashMap, Kafka, etc.).');
    }

    return base.join(' ');
  }

  function buildVisionPrompt(context) {
    const userQ = String(context.userQuestion || '').trim();
    const focusAction = context.focusAction || '';

    const system = [
      'You are OpenSage — a concise senior engineer & coach.',
      'The attached screenshot is often a code editor / IDE — sometimes from a screen-share, video call, or live interview where someone (a student, candidate, or teammate) is sharing their screen.',
      'OCR the visible code carefully and auto-detect the programming language and framework. Never ask the user what language it is.',
      'Recognize split-pane layouts (problem on the left, code editor on the right) and combine both panels into your answer.',
      'When you reference issues, ALWAYS cite line numbers and function/class names (e.g. `parseInput()` line 14, `class TreeNode` line 22). If line numbers are not visible, infer line offsets from the visible top of the code.',
      'Use fenced code blocks with language tags for any code suggestions.',
      'Do not refuse to analyze code shared on screen — this is for educational / mentoring / pair-programming use.',
      'Be tight: lead with the answer; structure with markdown.'
    ].join(' ');

    const focusHints = {
      findIssues:    'Focus on bugs and correctness issues first.',
      security:      'Focus on security vulnerabilities first (severity-rated).',
      errorHandling: 'Focus on error handling, exception flow, missing try/catch, retries, timeouts.',
      refactor:      'Focus on refactor / readability / performance.',
      complete:      'Focus on completing the unfinished function or block in the screenshot.',
      explain:       'Focus on explaining what the visible code does.',
      code:          'Focus on writing the missing code based on what is visible.',
      coach:         ''
    };
    const focusLine = focusHints[focusAction] || '';

    let userBody;
    if (userQ) {
      userBody =
        `User asked (answer this directly using the screenshot):\n"${userQ}"\n\n` +
        (focusLine ? focusLine + '\n\n' : '') +
        `Known page: ${context.siteLabel || 'Unknown'}\n` +
        `Known title: ${context.title || 'Unknown'}\n` +
        `Known language hint: ${context.language || 'auto-detect from screenshot'}\n\n` +
        'Format your reply:\n' +
        '**Answer** — direct response to the user (1–4 short lines).\n\n' +
        '**Where in the code** — function name + line range you are referring to.\n\n' +
        '**Suggestion** — fenced code block with the change, if applicable.\n\n' +
        '**Other things you should know** — 0–3 bullets only if useful (bugs, security, perf you spotted while reading).';
    } else {
      userBody =
        `Page: ${context.siteLabel || 'Unknown'}\n` +
        `Known title: ${context.title || 'Unknown'}\n` +
        `Known language hint: ${context.language || 'auto-detect from screenshot'}\n\n` +
        'Analyze the screenshot of the editor / screen and respond in this exact structure. ' +
        'For every finding, include the function/class name and a line number or line range.\n\n' +
        '**1. What I see** — 1–2 lines: language, framework, what the code is doing. If a problem statement is visible (e.g. LeetCode prompt on the left), state it in 1 line.\n\n' +
        '**2. 🐛 Bugs & correctness** — each finding: `funcName() L<line>` → bug → 1-line fix.\n\n' +
        '**3. 🛡 Security** — each finding: `funcName() L<line>` → severity → fix.\n\n' +
        '**4. ⚡ Optimization & quality** — perf, complexity, idiomatic improvements with line refs.\n\n' +
        '**5. ✅ Solution / completion** — IMPORTANT: if the code is incomplete (empty function body, `pass`, `// TODO`, missing return, partial expression) OR if a problem statement is visible without a working solution, OUTPUT THE COMPLETE WORKING CODE in a single fenced code block. Match the visible function signature exactly. Include time & space complexity in 1 line below the code. Do not just describe what to do — write it.\n\n' +
        'If a section has nothing real to report, write "_None spotted._" — but section 5 must always either complete the code or, if everything is already correct & complete, say "_Code looks complete._" and suggest 1 next improvement.';
    }

    return { system, user: userBody };
  }

  function trimBlock(text, maxChars) {
    const value = String(text || '').trim();
    if (!value) return '';
    if (value.length <= maxChars) return value;
    return `${value.slice(0, maxChars)}\n...`;
  }

  return { buildActionPrompt, buildVisionPrompt };
})();
