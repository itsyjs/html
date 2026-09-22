// The comparison tables: every column gets one unit, and the first drops units entirely,
// because a unit per row is useless when you read down a column — 947 µs against 2.66 ms
// against 190 µs is three conversions before you know who won.
//
// Every renderer is measured in its own process, containing that renderer and nothing else.
//
// That is not fussiness. A process holding all seven does not measure any of them honestly:
// renderers/lit.js installs a global DOM shim on import, and @itsy/html used to declare a
// String subclass, which cost every other library in the process up to 2.8x — enough to
// reverse who won. Hence spec.js, which carries the case list and the module paths and
// deliberately imports no renderer, so a child can load exactly one.
//
// One library per process is also how the thing actually runs in production.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { do_not_optimize, measure } from 'mitata';
import { ATTR_CASES, ATTR_KEYS, ATTR_RENDERERS, CASES, CASE_KEYS, MIN_CPU_TIME, RENDERERS } from './spec.js';

// Child: measure one renderer and hand the numbers back as JSON. Note what is *not* imported
// above — harness.js pulls in every renderer, so the child must never touch it.
const only = process.argv[2];
if (only !== undefined) {
  const spec = RENDERERS[Number(only)];
  const r = (await import(spec.module))[spec.export];
  const keys = ATTR_RENDERERS.includes(spec.name) ? [...CASE_KEYS, ...ATTR_KEYS] : CASE_KEYS;

  // Warm the process. mitata warms each function it is handed but cannot do this, and measured
  // cold a case reads ~30% slow.
  for (let i = 0; i < 12; i++) for (const k of keys) r[k]();

  const mine = {};
  for (const k of keys) mine[k] = (await measure(() => do_not_optimize(r[k]()), { min_cpu_time: MIN_CPU_TIME })).p50;
  process.stdout.write(JSON.stringify(mine));
  process.exit(0);
}

// Parent: guard, then spawn a child per renderer. harness.js is imported here and only here.
const { baseline, contenders, verify } = await import('./harness.js');
verify();

const self = fileURLToPath(import.meta.url);
const ns = Object.fromEntries(CASE_KEYS.map((k) => [k, {}]));
const attrNs = Object.fromEntries(ATTR_KEYS.map((k) => [k, {}]));
for (const [i, spec] of RENDERERS.entries()) {
  if (process.stderr.isTTY) process.stderr.write(`\rmeasuring ${spec.name}${' '.repeat(40)}`);
  const out = JSON.parse(execFileSync(process.execPath, ['--expose-gc', self, String(i)], { encoding: 'utf8' }));
  for (const k of CASE_KEYS) ns[k][spec.name] = out[k];
  for (const k of ATTR_KEYS) if (k in out) attrNs[k][spec.name] = out[k];
}
if (process.stderr.isTTY) process.stderr.write(`\r${' '.repeat(60)}\r`);

// One unit for a whole column, chosen from the column median. Not from the fastest
// entry: that is the unescaped baseline, and it would put the real contenders in the
// thousands of the unit below.
const unit = (row) => {
  const sorted = Object.values(row).sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1];
  return median < 1e3 ? ['ns', 1] : median < 1e6 ? ['µs', 1e3] : ['ms', 1e6];
};

const fmt = (v) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2));

const render = (title, note, head, rows) => {
  const width = head.map((c, i) => Math.max(c.length, ...rows.map((r) => r[i].length)));
  const line = (cells) =>
    `| ${cells.map((c, i) => (i === 0 ? c.padEnd(width[i]) : c.padStart(width[i]))).join(' | ')} |`;
  console.log(`\n### ${title}\n\n${note}\n`);
  console.log(line(head));
  console.log(`| ${width.map((w, i) => (i === 0 ? '-'.repeat(w) : `${'-'.repeat(w - 1)}:`)).join(' | ')} |`);
  for (const r of rows) console.log(line(r));
};

// Relative to @itsy/html, so a reader can see the gap without doing arithmetic.
const speed = (key, name) => ns[key][baseline.name] / ns[key][name];
const mean = (name) => Math.exp(CASE_KEYS.reduce((s, k) => s + Math.log(speed(k, name)), 0) / CASE_KEYS.length);
const order = [...contenders].sort((a, b) => mean(b.name) - mean(a.name));

// Both tables take their headers and their cells from CASE_KEYS, so a case added in one
// place cannot end up labelled with another one's name.
render(
  'Relative speed',
  `Higher is faster. ${baseline.name} is 1.00 in every column, so 2.11 means twice as fast as it and 0.50 means half.`,
  ['renderer', ...CASE_KEYS.map((k) => CASES[k]), 'overall'],
  order.map((r) => [r.name, ...CASE_KEYS.map((k) => speed(k, r.name).toFixed(2)), mean(r.name).toFixed(2)]),
);

render(
  'Time per render',
  'One unit per column. Lower is faster.',
  ['renderer', ...CASE_KEYS.map((k) => `${CASES[k]} (${unit(ns[k])[0]})`)],
  order.map((r) => [r.name, ...CASE_KEYS.map((k) => fmt(ns[k][r.name] / unit(ns[k])[1]))]),
);

// A separate table, because only three of the seven can do this at all.
const attrOrder = ATTR_RENDERERS.map((name) => ({ name })).sort((a, b) => attrNs.attrs[a.name] - attrNs.attrs[b.name]);
render(
  'Attributes from an object',
  'Ten links whose attribute names come from an object at render time, not from the template.\n' +
    'lit is absent because @lit-labs/ssr cannot render an element part; hono and ghtml because neither\n' +
    'has an attribute mechanism, so their rows would time our string builder rather than the library.',
  ['renderer', `${ATTR_CASES.attrs} (${unit(attrNs.attrs)[0]})`, 'vs hand-written'],
  attrOrder.map((r) => [
    r.name,
    fmt(attrNs.attrs[r.name] / unit(attrNs.attrs)[1]),
    (attrNs.attrs['hand-written (escape + concat)'] / attrNs.attrs[r.name]).toFixed(2),
  ]),
);

console.log();
