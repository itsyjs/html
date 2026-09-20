// Server-side rendering: template in, escaped HTML string out.
//
// Every contender does the whole job inside the timed function, including the
// step that produces the final string. For lit that means @lit-labs/ssr, since
// `html` on its own only builds a TemplateResult and renders nothing.

import { barplot, bench, do_not_optimize, group, run, summary } from 'mitata';
import { escaped, raw } from './renderers/baseline.js';
import ghtml from './renderers/ghtml.js';
import hono from './renderers/hono.js';
import itsy from './renderers/itsy.js';
import lit from './renderers/lit.js';
import preact from './renderers/preact.js';

const contenders = [itsy, hono, ghtml, preact, lit, escaped, raw];

// Fairness guard: prove each renderer really rendered every row and really escaped,
// before any of it is timed. A contender that quietly skipped the work would win.
const verify = () => {
  for (const r of contenders) {
    const rows = (r.table().match(/<tr[ >]/g) ?? []).length;
    if (rows !== 1000) throw new Error(`${r.name}: rendered ${rows} rows, expected 1000`);
    if (!r.unsafe && r.escape().includes('<script>')) throw new Error(`${r.name}: left a <script> unescaped`);
  }
};

const CASES = {
  link: 'one <a>, two values',
  card: 'one element, five values',
  page: 'nav + list, nested templates',
  table: '1000 rows x 4 cells',
  escape: 'text that is all escapable characters',
};

verify();

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
