// A micro-benchmark of the escaper alone.
//
// The `escape` case in server.js pointed here: @itsy/html and the hand-written
// baseline share a `String.replace` with a callback, and both land about twice
// as slow as hono, which scans with charCodeAt and slices. This isolates that.

import { bench, boxplot, do_not_optimize, group, run, summary } from 'mitata';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** What src/shared.ts does today. */
const replaceCallback = (s) => s.replace(/[&<>"']/g, (c) => ESC[c] ?? c);

/** The same output, found with search() and built with slice(), as hono does. */
const FIRST = /[&<>"']/;
const scanAndSlice = (s) => {
  let at = s.search(FIRST);
  if (at === -1) return s;
  let out = '';
  let last = 0;
  for (; at < s.length; at++) {
    let e;
    switch (s.charCodeAt(at)) {
      case 38:
        e = '&amp;';
        break;
      case 60:
        e = '&lt;';
        break;
      case 62:
        e = '&gt;';
        break;
      case 34:
        e = '&quot;';
        break;
      case 39:
        e = '&#39;';
        break;
      default:
        continue;
    }
    out += s.slice(last, at) + e;
    last = at + 1;
  }
  return out + s.slice(last);
};

const INPUTS = {
  'clean (nothing to escape)': 'The quick brown fox jumps over the lazy dog, and then some more text.',
  'typical (two escapes)': 'Widget 42 & "co" — everyday product copy with a little punctuation in it.',
  'hostile (every character)': '<script>alert("xss") & \'more\'</script>'.repeat(20),
};

// Same output, or the comparison means nothing.
for (const s of Object.values(INPUTS)) {
  if (replaceCallback(s) !== scanAndSlice(s)) throw new Error('escapers disagree');
}

for (const [label, input] of Object.entries(INPUTS)) {
  group(label, () => {
    boxplot(() => {
      summary(() => {
        bench('replace + callback (today)', () => do_not_optimize(replaceCallback(input)));
        bench('search + slice (hono-style)', () => do_not_optimize(scanAndSlice(input)));
      });
    });
  });
}

await run();
