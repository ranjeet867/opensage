// OpenSage — site detection
// Every site is supported. The detector labels known coding / practice
// platforms so the content extractor can apply platform-specific
// selectors; unknown sites fall back to a universal editor scan.

window.IA_SITE_DETECTOR = (() => {
  const CLASSIFICATIONS = {
    codingPractice: 'Coding Practice',
    assessment: 'Assessment / Proctored',
    genericCoding: 'Code Editor',
    reading: 'Documentation / Article',
    meeting: 'Meeting / Video',
    universal: 'Universal'
  };

  // Known coding-practice platforms with dedicated extractors.
  const CODING_PRACTICE = [
    { id: 'leetcode',      label: 'LeetCode',         test: (u) => /(^|\.)leetcode\.(com|cn)$/.test(u.hostname) },
    { id: 'hackerrank',    label: 'HackerRank',       test: (u) => /(^|\.)hackerrank\.com$/.test(u.hostname) },
    { id: 'codesignal',    label: 'CodeSignal',       test: (u) => /(^|\.)codesignal\.(com|io)$/.test(u.hostname) },
    { id: 'hackerearth',   label: 'HackerEarth',      test: (u) => /(^|\.)hackerearth\.com$/.test(u.hostname) },
    { id: 'codechef',      label: 'CodeChef',         test: (u) => /(^|\.)codechef\.com$/.test(u.hostname) },
    { id: 'codeforces',    label: 'Codeforces',       test: (u) => /(^|\.)codeforces\.com$/.test(u.hostname) },
    { id: 'atcoder',       label: 'AtCoder',          test: (u) => /(^|\.)atcoder\.jp$/.test(u.hostname) },
    { id: 'interviewbit',  label: 'InterviewBit',     test: (u) => /(^|\.)interviewbit\.com$/.test(u.hostname) },
    { id: 'geeksforgeeks', label: 'GeeksforGeeks',    test: (u) => /(^|\.)geeksforgeeks\.org$/.test(u.hostname) || /(^|\.)practice\.geeksforgeeks\.org$/.test(u.hostname) },
    { id: 'codingninjas',  label: 'Coding Ninjas',    test: (u) => /(^|\.)codingninjas\.com$/.test(u.hostname) },
    { id: 'exercism',      label: 'Exercism',         test: (u) => /(^|\.)exercism\.(io|org)$/.test(u.hostname) },
    { id: 'freecodecamp',  label: 'freeCodeCamp',     test: (u) => /(^|\.)freecodecamp\.org$/.test(u.hostname) },
    { id: 'edabit',        label: 'Edabit',           test: (u) => /(^|\.)edabit\.com$/.test(u.hostname) },
    { id: 'kattis',        label: 'Kattis',           test: (u) => /(^|\.)kattis\.com$/.test(u.hostname) },
    { id: 'topcoder',      label: 'TopCoder',         test: (u) => /(^|\.)topcoder\.com$/.test(u.hostname) },
    { id: 'spoj',          label: 'SPOJ',             test: (u) => /(^|\.)spoj\.com$/.test(u.hostname) },
    { id: 'codewars',      label: 'Codewars',         test: (u) => /(^|\.)codewars\.com$/.test(u.hostname) },
    { id: 'pramp',         label: 'Pramp',            test: (u) => /(^|\.)pramp\.com$/.test(u.hostname) },
    { id: 'coderpad',      label: 'CoderPad',         test: (u) => /(^|\.)coderpad\.io$/.test(u.hostname) },
    { id: 'codility',      label: 'Codility',         test: (u) => /(^|\.)codility\.com$/.test(u.hostname) },
    { id: 'testdome',      label: 'TestDome',         test: (u) => /(^|\.)testdome\.com$/.test(u.hostname) },
    { id: 'triplebyte',    label: 'Triplebyte',       test: (u) => /(^|\.)triplebyte\.com$/.test(u.hostname) },
    { id: 'localhost',     label: 'Localhost',        test: (u) => /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(u.hostname) }
  ];

  const ASSESSMENT_HINTS = [
    { id: 'leetcode-assessment',  label: 'LeetCode Assessment',  test: (u) => /leetcode\.(com|cn)$/.test(u.hostname) && /(assessment|contest|interview)/i.test(u.pathname) },
    { id: 'hackerrank-test',      label: 'HackerRank Test',      test: (u) => /hackerrank\.com$/.test(u.hostname) && /(tests|skills-verification-test|contests)/i.test(u.pathname) },
    { id: 'codesignal-assessment',label: 'CodeSignal Assessment',test: (u) => /codesignal\.(com|io)$/.test(u.hostname) && /(assessment|interview)/i.test(u.pathname) }
  ];

  // Online IDEs / editors where we still want full extraction.
  const GENERIC_CODING = [
    { id: 'github',       label: 'GitHub',       test: (u) => /(^|\.)github\.com$/.test(u.hostname) },
    { id: 'gitlab',       label: 'GitLab',       test: (u) => /(^|\.)gitlab\.com$/.test(u.hostname) },
    { id: 'bitbucket',    label: 'Bitbucket',    test: (u) => /(^|\.)bitbucket\.org$/.test(u.hostname) },
    { id: 'stackblitz',   label: 'StackBlitz',   test: (u) => /(^|\.)stackblitz\.com$/.test(u.hostname) },
    { id: 'codesandbox',  label: 'CodeSandbox',  test: (u) => /(^|\.)codesandbox\.io$/.test(u.hostname) },
    { id: 'replit',       label: 'Replit',       test: (u) => /(^|\.)replit\.com$/.test(u.hostname) },
    { id: 'codepen',      label: 'CodePen',      test: (u) => /(^|\.)codepen\.io$/.test(u.hostname) },
    { id: 'jsfiddle',     label: 'JSFiddle',     test: (u) => /(^|\.)jsfiddle\.net$/.test(u.hostname) },
    { id: 'jsbin',        label: 'JS Bin',       test: (u) => /(^|\.)jsbin\.com$/.test(u.hostname) },
    { id: 'go-playground',label: 'Go Playground',test: (u) => /(^|\.)go\.dev$/.test(u.hostname) || /play\.golang\.org$/.test(u.hostname) },
    { id: 'rustplay',     label: 'Rust Playground',test: (u) => /play\.rust-lang\.org$/.test(u.hostname) },
    { id: 'pyiodide',     label: 'PyScript / Python Playground', test: (u) => /(playground\.python\.org)/.test(u.hostname) },
    { id: 'vscode-web',   label: 'VS Code Web',  test: (u) => /vscode\.dev$/.test(u.hostname) || /github\.dev$/.test(u.hostname) }
  ];

  const READING = [
    { id: 'stackoverflow', label: 'Stack Overflow', test: (u) => /(^|\.)stackoverflow\.com$/.test(u.hostname) || /(^|\.)stackexchange\.com$/.test(u.hostname) },
    { id: 'mdn',           label: 'MDN',            test: (u) => /developer\.mozilla\.org$/.test(u.hostname) },
    { id: 'devdocs',       label: 'DevDocs',        test: (u) => /devdocs\.io$/.test(u.hostname) },
    { id: 'medium',        label: 'Medium',         test: (u) => /(^|\.)medium\.com$/.test(u.hostname) },
    { id: 'dev.to',        label: 'DEV',            test: (u) => /(^|\.)dev\.to$/.test(u.hostname) }
  ];

  const MEETING_VIDEO = [
    { id: 'google-meet',   label: 'Google Meet',     test: (u) => /meet\.google\.com$/.test(u.hostname) },
    { id: 'zoom',          label: 'Zoom',            test: (u) => /(^|\.)zoom\.us$/.test(u.hostname) },
    { id: 'teams',         label: 'Microsoft Teams', test: (u) => /teams\.microsoft\.com$/.test(u.hostname) },
    { id: 'webex',         label: 'Webex',           test: (u) => /(^|\.)webex\.com$/.test(u.hostname) }
  ];

  function detectPage(href = window.location.href) {
    let url;
    try {
      url = new URL(href);
    } catch {
      return asUniversal('invalid-url', href);
    }

    const practice = CODING_PRACTICE.find((e) => e.test(url));
    if (practice) return ok(url, practice.id, practice.label, CLASSIFICATIONS.codingPractice, 'matched-coding-practice');

    const assessment = ASSESSMENT_HINTS.find((e) => e.test(url));
    if (assessment) return ok(url, assessment.id, assessment.label, CLASSIFICATIONS.assessment, 'matched-assessment');

    const generic = GENERIC_CODING.find((e) => e.test(url));
    if (generic) return ok(url, generic.id, generic.label, CLASSIFICATIONS.genericCoding, 'matched-generic-coding');

    const reading = READING.find((e) => e.test(url));
    if (reading) return ok(url, reading.id, reading.label, CLASSIFICATIONS.reading, 'matched-reading');

    const meeting = MEETING_VIDEO.find((e) => e.test(url));
    if (meeting) return ok(url, meeting.id, meeting.label, CLASSIFICATIONS.meeting, 'matched-meeting');

    // Universal fallback — always supported, always returns a friendly label.
    return asUniversal('universal-fallback', url.hostname);
  }

  function ok(url, id, label, classification, reason) {
    return log(url, {
      supported: true,
      siteId: id,
      siteLabel: label,
      classification,
      reason
    });
  }

  function asUniversal(reason, host) {
    return log(null, {
      supported: true, // everything is supported now
      siteId: 'universal',
      siteLabel: host ? `Web — ${host}` : 'Web',
      classification: CLASSIFICATIONS.universal,
      reason
    });
  }

  function log(url, result) {
    try {
      console.info('[OpenSage] site-detect', {
        href: url?.href,
        site: result.siteId,
        classification: result.classification,
        reason: result.reason
      });
    } catch (_) {}
    return result;
  }

  return { detectPage, CLASSIFICATIONS };
})();
