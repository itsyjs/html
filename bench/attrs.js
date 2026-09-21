// attrs() on its own, across the shapes that take different paths through it.
//
// A boolean on a tri-state name (`aria-*`, `draggable`, `spellcheck`, `contenteditable`)
// skips attrValue entirely; every other value goes through the on* refusal and the URL
// routing. Those two paths cost very differently, so one number for "attrs()" hides more
// than it tells. Run this after touching src/attrs.ts or attrValue in src/shared.ts.

import { attrs } from '@itsy/html';
import { barplot, bench, do_not_optimize, group, run, summary } from 'mitata';
import { one } from './fixtures.js';

const SHAPES = {
  'single string': { class: 'btn' },
  'boolean-heavy': { disabled: true, hidden: false, draggable: true },
  'aria group': { aria: { expanded: true, controls: 'menu', label: one.name } },
  'mixed, 5 attributes': { class: 'btn is-featured', 'data-id': '0', 'aria-label': one.name, title: one.name, href: one.href },
  'a document frame': { lang: 'nb', dir: 'ltr', class: 'page', 'data-env': 'prod' },
};

// Same reason as harness.js: the first thing timed in a fresh process pays for growing
// the V8 heap and reads 2-3x slow. Warm every shape before any of them is recorded.
for (let i = 0; i < 2000; i++) for (const o of Object.values(SHAPES)) attrs(o);

group('attrs()', () => {
  barplot(() => {
    summary(() => {
      for (const [label, o] of Object.entries(SHAPES)) bench(label, () => do_not_optimize(String(attrs(o))));
    });
  });
});

await run();
