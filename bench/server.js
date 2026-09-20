// Server-side rendering: template in, escaped HTML string out.
//
// Every contender does the whole job inside the timed function, including the
// step that produces the final string. For lit that means @lit-labs/ssr, since
// `html` on its own only builds a TemplateResult and renders nothing.
//
// This is mitata's own output, with distributions and histograms. For the tables
// that can be read down a column, run table.js instead.

import { barplot, bench, do_not_optimize, group, run, summary } from 'mitata';
import { baseline as itsy, contenders, verify, warmup } from './harness.js';

const CASES = {
  link: 'one <a>, two values',
  card: 'one element, five values',
  page: 'nav + list, nested templates',
  table: '1000 rows x 4 cells',
  escape: 'text that is all escapable characters',
};

verify();
// Grow the heap before anything is timed. Without this the first renderer measured
// pays for growing it and reads 2-3x slow; see harness.js.
warmup();

for (const [key, blurb] of Object.entries(CASES)) {
  group(`${key} — ${blurb}`, () => {
    barplot(() => {
      summary(() => {
        for (const r of contenders) bench(r.name, () => do_not_optimize(r[key]()));
      });
    });
  });
}

// Only @itsy/html is measured cold: it is the one with a scan to pay for, and the
// number answers "what does the first render of a call site cost?"
group('cold — first render of a call site (@itsy/html only)', () => {
  bench('@itsy/html scan + render', () => do_not_optimize(itsy.cold()));
  bench('@itsy/html cached (same work, warm)', () => do_not_optimize(itsy.link()));
});

await run();
