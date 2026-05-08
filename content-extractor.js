// OpenSage — universal content extractor
// Works on any website. Has per-platform overrides for known
// coding/practice sites (LeetCode, HackerRank, CodeSignal,
// GeeksforGeeks, CodeChef, Codeforces, AtCoder, HackerEarth,
// InterviewBit, CodingNinjas, Exercism, Codewars, CoderPad,
// freeCodeCamp, CodePen, Replit, StackBlitz, CodeSandbox, GitHub,
// Gitlab, VS Code Web, Go / Rust playgrounds, Kattis, TopCoder, SPOJ,
// Pramp, Codility, TestDome). Everything else uses a universal
// scan that still picks up Monaco, CodeMirror (v5 & v6), Ace editor,
// Prism / highlight.js blocks, <textarea>, contenteditable and plain
// <pre>/<code> blocks.

window.IA_CONTENT_EXTRACTOR = (() => {
  const MAX_TEXT      = 6000;
  const MAX_SUMMARY   = 540;
  const MAX_CODE_CHAR = 8000;

  // Platform-specific selectors. Everything ultimately falls back to
  // the universal scanners below if these miss.
  const TITLE_SELECTORS = {
    leetcode:      ['[data-cy="question-title"]','.text-title-large','div[class*="title"] a','h1'],
    hackerrank:    ['.challenge-name','.challenge-title','header h1','h1'],
    codesignal:    ['h1','[class*="task"] [class*="title"]'],
    hackerearth:   ['.problem-name h3','.problem-title','h1'],
    codechef:      ['.problem-title','h1','#problem-statement h3'],
    codeforces:    ['.problem-statement .title','.title','h1'],
    atcoder:       ['.h2','span.h2','h1'],
    interviewbit:  ['.problem-title h3','h1'],
    geeksforgeeks: ['.problem-tab h3','.problem-tab .problem-title','h1','.entry-title'],
    codingninjas:  ['.problem-statement-header h1','[class*="problem-title"]','h1'],
    exercism:      ['h1','header h2'],
    freecodecamp:  ['h1','.challenge-title'],
    edabit:        ['h1','.challenge-title'],
    kattis:        ['h1','.problem-title'],
    topcoder:      ['h1','.problem-title'],
    spoj:          ['h1','#problem-name'],
    codewars:      ['.kata-title','h1'],
    pramp:         ['h1','.question-title'],
    coderpad:      ['h1','[data-testid="question-title"]'],
    codility:      ['h1','.task-title'],
    testdome:      ['h1','.question-title'],
    localhost:     ['h1','[data-problem-title]','title'],
    github:        ['[data-testid="breadcrumbs-filename"]','strong.mr-2','h1','title'],
    'go-playground':['h1','title']
  };

  const STATEMENT_SELECTORS = {
    leetcode:      ['[data-track-load="description_content"]','[data-cy="question-content"]','div.elfjS','div[class*="description__"]'],
    hackerrank:    ['.challenge-body-html','.challenge_problem_statement','#problem-statement','.problem-statement'],
    codesignal:    ['[class*="task-description"]','[class*="description"]','main article'],
    hackerearth:   ['.problem-statement','.starwars-lab .problem-statement','.problem-body'],
    codechef:      ['#problem-statement','#problem-statement-wrap','.problem-statement','main article'],
    codeforces:    ['.problem-statement'],
    atcoder:       ['#task-statement','.lang-en','.problem-statement'],
    interviewbit:  ['.problem-statement','[class*="description"]'],
    geeksforgeeks: ['.problem-statement','.problems_problem_content__Xm_eO','.problem_statement','article'],
    codingninjas:  ['[class*="problem-statement"]','[class*="description"]','article'],
    exercism:      ['.instructions','.markdown-body','article'],
    freecodecamp:  ['#description','.description-container','article'],
    edabit:        ['.challenge__instructions','article'],
    kattis:        ['.problembody'],
    topcoder:      ['.problem-statement','article'],
    spoj:          ['#problem-body'],
    codewars:      ['#description','.markdown'],
    pramp:         ['.question','article'],
    coderpad:      ['[data-testid="question-description"]','article'],
    codility:      ['.task-description','article'],
    testdome:      ['.question-description','article'],
    localhost:     ['[data-problem-body]','main','#root','article'],
    github:        ['article.markdown-body','.markdown-body','[data-testid="readme"]']
  };

  const EXAMPLES_SELECTORS = {
    leetcode:      ['[data-track-load="description_content"] pre','[data-cy="question-content"] pre'],
    hackerrank:    ['.challenge-body-html pre','.challenge_problem_statement pre','.problem-statement pre'],
    codesignal:    ['pre'],
    hackerearth:   ['.input-output pre','pre'],
    codechef:      ['#problem-statement pre','pre'],
    codeforces:    ['.sample-tests pre','pre'],
    atcoder:       ['#task-statement pre','pre'],
    interviewbit:  ['pre'],
    geeksforgeeks: ['.problems_problem_content__Xm_eO pre','pre'],
    codingninjas:  ['pre'],
    exercism:      ['pre'],
    freecodecamp:  ['pre'],
    codewars:      ['pre'],
    localhost:     ['[data-examples]','pre']
  };

  const LANGUAGE_SELECTORS = {
    leetcode:      ['button[class*="lang"]','[data-cy="lang-select"]','[id*="headlessui-listbox-button"]','button:has(> span[class*="lang"])'],
    hackerrank:    ['.css-1hwfws3','[data-analytics="language-select"]','[class*="language"]','[aria-haspopup="listbox"]'],
    codesignal:    ['[class*="language"]','[aria-label*="language"]','[data-test*="language"]'],
    hackerearth:   ['.editor-lang','.editor-language-select'],
    codechef:      ['#edit_area_toolbar #lang_select','[class*="language-select"]'],
    codeforces:    ['select[name="programTypeId"]','[class*="lang-select"]'],
    atcoder:       ['#select-lang','[name="lang"]','select[name*="lang"]'],
    interviewbit:  ['[class*="lang"]','[aria-label*="language"]'],
    geeksforgeeks: ['.divider-dropdown','[class*="language-select"]','[aria-label*="language"]'],
    codingninjas:  ['[class*="language"]','[aria-label*="language"]'],
    exercism:      ['[class*="lang"]','[class*="track"]'],
    coderpad:      ['[data-testid="language-select"]','[class*="language"]'],
    codewars:      ['.language-tag','[class*="language"]'],
    github:        ['[data-testid="breadcrumbs-filename"]','title'],
    'go-playground':['title']
  };

  function extractPageContext(siteId) {
    const site = siteId || 'universal';
    const title        = compact(firstText(TITLE_SELECTORS[site]) || extractTitleFallback());
    const statementRaw = firstText(STATEMENT_SELECTORS[site]) || extractStatementFallback();
    const statement    = compact(statementRaw).slice(0, MAX_TEXT);
    const examples     = compact(joinTexts(EXAMPLES_SELECTORS[site] || ['pre'], 3));
    const constraints  = compact(extractConstraints());
    const languageDom  = compact(firstText(LANGUAGE_SELECTORS[site] || []));
    const code         = compact(extractCode(site));
    const language     = languageDom || detectLanguage(code, title);
    const cursorContext= compact(extractCursorContext());
    const pageText     = compact(extractPageTextFallback());
    const summary      = buildSummary({ title, statement, examples, constraints, code });
    const summaryCompact = buildCompactSummary({ title, statement, constraints });

    return {
      title: title || 'Untitled page',
      statement,
      examples,
      constraints,
      language: language || 'Unknown',
      code: (code || '').slice(0, MAX_CODE_CHAR),
      cursorContext,
      pageText: pageText.slice(0, MAX_TEXT),
      summary,
      summaryCompact,
      hasStrongDomContext: Boolean((statement && statement.length > 140) || (pageText && pageText.length > 400)),
      extractedAt: Date.now()
    };
  }

  // ---- Universal fallbacks ----

  function extractTitleFallback() {
    return document.title ||
      document.querySelector('h1')?.innerText ||
      document.querySelector('[role="heading"]')?.innerText || '';
  }

  function extractStatementFallback() {
    const containers = [
      'main','[role="main"]','article','#content','#main','[class*="problem"]',
      '[class*="description"]','[class*="question"]','[class*="statement"]'
    ];
    for (const sel of containers) {
      const node = document.querySelector(sel);
      if (node) {
        const txt = (node.innerText || node.textContent || '').trim();
        if (txt && txt.length > 120) return txt;
      }
    }
    return '';
  }

  function extractConstraints() {
    const blocks = Array.from(document.querySelectorAll('li, p, div, span'))
      .map((node) => node.innerText || '')
      .filter(Boolean);
    const matches = blocks.filter((t) => /constraint|limit|bound|range|time limit|memory limit/i.test(t));
    return matches.slice(0, 6).join('\n');
  }

  function extractCode(site) {
    // 1. Monaco (LeetCode, CodeSignal, CoderPad, VS Code Web, many IDEs)
    const monaco = extractMonacoText();
    if (monaco) return monaco;

    // 2. CodeMirror 6 (.cm-content) and CodeMirror 5 (.CodeMirror-code)
    const cm6 = document.querySelector('.cm-content');
    if (cm6?.innerText) return cm6.innerText;
    const cm5 = document.querySelector('.CodeMirror-code');
    if (cm5?.innerText) return cm5.innerText;

    // 3. Ace editor (HackerRank, older CodeChef, Kattis)
    const ace = document.querySelector('.ace_editor');
    if (ace) {
      const lines = Array.from(ace.querySelectorAll('.ace_line'))
        .map((n) => n.textContent || '').join('\n');
      if (compact(lines).length > 20) return lines;
    }

    // 4. Go playground textarea / Rust playground
    if (site === 'go-playground') {
      const textarea = document.querySelector('#code, textarea');
      if (textarea?.value) return textarea.value;
    }
    if (site === 'rustplay') {
      const ta = document.querySelector('textarea, .cm-content');
      const v  = ta?.value || ta?.innerText || '';
      if (v) return v;
    }

    // 5. Generic editor-like textareas / contenteditable
    const candidates = Array.from(document.querySelectorAll('textarea, [contenteditable="true"]'))
      .map((n) => ({ node: n, text: (n.value || n.innerText || '') }))
      .filter(({ text }) => text && text.trim().length > 20);
    if (candidates.length) {
      candidates.sort((a, b) => b.text.length - a.text.length);
      return candidates[0].text;
    }

    // 6. GitHub code view
    if (site === 'github') {
      const codeLines = Array.from(document.querySelectorAll('table.js-file-line-container td.blob-code, .react-code-text, .react-line-number + .react-code-text'))
        .map((n) => n.innerText || '').filter(Boolean);
      if (codeLines.length) return codeLines.join('\n');
    }

    // 7. Syntax-highlighted <pre><code> blocks (Prism / highlight.js)
    const highlighted = Array.from(document.querySelectorAll('pre code, pre.highlight, pre.prettyprint, pre[class*="language-"]'))
      .map((n) => n.innerText || '').filter(Boolean);
    if (highlighted[0]) return highlighted[0];

    // 8. Any <pre>/<code> that looks like code
    const preCode = Array.from(document.querySelectorAll('pre, code'))
      .map((n) => n.innerText || '')
      .filter((t) => /(class |function |def |public |const |let |import |#include|package |fn |func |->|=>)/.test(t));
    return preCode[0] || '';
  }

  function extractMonacoText() {
    const monacos = Array.from(document.querySelectorAll('.monaco-editor'));
    if (!monacos.length) return '';
    // Prefer the monaco with the most view-lines (active editor).
    let best = '';
    for (const monaco of monacos) {
      const viewLines = monaco.querySelector('.view-lines');
      if (!viewLines) continue;
      const lines = Array.from(viewLines.querySelectorAll('.view-line'))
        .map((n) => n.innerText || n.textContent || '')
        .filter((t) => t.trim().length || t === '')
        .join('\n');
      if (lines.length > best.length) best = lines;
    }
    return best;
  }

  function extractCursorContext() {
    const active = document.activeElement;
    if (active && active.tagName === 'TEXTAREA' && typeof active.selectionStart === 'number') {
      const text = active.value || '';
      const start = Math.max(0, active.selectionStart - 400);
      const end = Math.min(text.length, active.selectionStart + 400);
      return text.slice(start, end);
    }

    const sel = window.getSelection?.();
    if (sel && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      const node = range.startContainer;
      const containerText = node?.textContent || node?.parentElement?.textContent || '';
      if (compact(containerText).length > 20) return containerText.slice(0, 800);
    }

    const cm6Active = document.querySelector('.cm-activeLine');
    if (cm6Active?.innerText) return cm6Active.innerText.slice(0, 800);

    const monacoCurrent = document.querySelector('.monaco-editor .view-overlays .current-line') ||
      document.querySelector('.monaco-editor .view-lines .view-line');
    if (monacoCurrent?.innerText) return monacoCurrent.innerText.slice(0, 800);

    const aceCursor = document.querySelector('.ace_cursor');
    if (aceCursor?.parentElement?.innerText) return aceCursor.parentElement.innerText.slice(0, 800);

    return '';
  }

  function extractPageTextFallback() {
    // Useful for any generic site — gives the LLM the main article text.
    const main = document.querySelector('main, [role="main"], article') || document.body;
    if (!main) return '';
    return (main.innerText || '').slice(0, MAX_TEXT);
  }

  function detectLanguage(code, title) {
    if (!code) return '';
    const hints = [
      { re: /#include\s*<|std::|->\s*int\s+main/, lang: 'C++' },
      { re: /\bclass\s+\w+\s*{[\s\S]*public\s+static\s+void\s+main/, lang: 'Java' },
      { re: /\bdef\s+\w+\(|from\s+\w+\s+import|print\(/, lang: 'Python' },
      { re: /\bfunc\s+\w+\(|package\s+main/, lang: 'Go' },
      { re: /\bfn\s+\w+\(|\blet\s+mut\b/, lang: 'Rust' },
      { re: /\bfunction\s+\w+\(|const\s+\w+\s*=|=>\s*{|console\.log/, lang: 'JavaScript' },
      { re: /:\s*(string|number|boolean)|\binterface\s+\w+\s*{/, lang: 'TypeScript' },
      { re: /<\?php|\becho\s+/, lang: 'PHP' },
      { re: /\bputs\s+|\bdef\s+\w+[\s\S]*\bend\b/, lang: 'Ruby' },
      { re: /\busing\s+System;|\bnamespace\s+\w+/, lang: 'C#' },
      { re: /\bSELECT\s+.*\bFROM\b/i, lang: 'SQL' },
      { re: /<html|<div|<!DOCTYPE/i, lang: 'HTML' },
      { re: /@import|#\w+\s*{|\.\w+\s*{/, lang: 'CSS' }
    ];
    for (const { re, lang } of hints) if (re.test(code)) return lang;
    const t = (title || '').toLowerCase();
    for (const lang of ['python','java','javascript','typescript','go','rust','ruby','php','c++','c#','swift','kotlin']) {
      if (t.includes(lang)) return lang.charAt(0).toUpperCase() + lang.slice(1);
    }
    return '';
  }

  // ---- Helpers ----

  function buildSummary({ title, statement, examples, constraints, code }) {
    return [title, stripBoilerplate(statement), stripBoilerplate(examples), stripBoilerplate(constraints), stripBoilerplate(code)]
      .filter(Boolean)
      .join('\n')
      .slice(0, MAX_TEXT) || 'No useful context extracted yet.';
  }

  function buildCompactSummary({ title, statement, constraints }) {
    const clean = stripBoilerplate(statement || '');
    const firstChunk = clean.split('\n').slice(0, 4).join(' ');
    const firstSentence = firstChunk.split('. ').slice(0, 2).join('. ').trim();
    const constraintLine = (constraints || '').split('\n')[0] || '';
    return [title || '', firstSentence, constraintLine ? `Constraint: ${constraintLine}` : '']
      .filter(Boolean)
      .join(' — ')
      .slice(0, MAX_SUMMARY) || 'No short summary available.';
  }

  function stripBoilerplate(text) {
    return compact(String(text || '')
      .replace(/Problem List|Testcase|Debugging|Editorial|Solutions|Submissions|Notebook Progress[\s\S]*/gi, '')
      .replace(/Seen this question in a real interview[\s\S]*/gi, '')
      .replace(/Try New Features[\s\S]*/gi, '')
      .replace(/Sign Out[\s\S]*/gi, '')
      .replace(/Premium user[\s\S]*/gi, ''));
  }

  function firstText(selectors) {
    if (!selectors) return '';
    for (const selector of selectors) {
      let node;
      try { node = document.querySelector(selector); } catch (_) { continue; }
      const text = node?.innerText || node?.textContent || '';
      if (compact(text)) return text;
    }
    return '';
  }

  function joinTexts(selectors, maxItems) {
    if (!selectors) return '';
    for (const selector of selectors) {
      let nodes;
      try { nodes = Array.from(document.querySelectorAll(selector)); } catch (_) { continue; }
      if (!nodes.length) continue;
      return nodes.slice(0, maxItems).map((n) => n.innerText || '').join('\n\n');
    }
    return '';
  }

  function compact(text) {
    return String(text || '')
      .replace(/\s+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  return { extractPageContext };
})();
