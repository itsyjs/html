// Bytes produced, for the same page, by each renderer.
//
// Throughput is not the only cost of an SSR renderer: what it emits travels over
// the wire on every request. lit's hydration markers are the reason it is here.

import { escaped, raw } from './renderers/baseline.js';
import ghtml from './renderers/ghtml.js';
import hono from './renderers/hono.js';
import itsy from './renderers/itsy.js';
import lit from './renderers/lit.js';
import preact from './renderers/preact.js';

const contenders = [itsy, hono, ghtml, preact, lit, escaped, raw];
const cases = ['link', 'card', 'page', 'table', 'escape'];
const bytes = (s) => Buffer.byteLength(s, 'utf8');

const baseline = Object.fromEntries(cases.map((c) => [c, bytes(itsy[c]())]));

const pad = (s, n) => String(s).padEnd(n);
const num = (s, n) => String(s).padStart(n);

console.log(`\noutput bytes, and the ratio to @itsy/html\n`);
console.log(pad('renderer', 32) + cases.map((c) => num(c, 18)).join(''));
console.log('-'.repeat(32 + cases.length * 18));

for (const r of contenders) {
  const cells = cases.map((c) => {
    const b = bytes(r[c]());
    const ratio = (b / baseline[c]).toFixed(2);
    return num(`${b.toLocaleString('en-US')} (${ratio}x)`, 18);
  });
  console.log(pad(r.name, 32) + cells.join(''));
}
console.log();
