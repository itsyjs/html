// The comparison tables. Each column gets one unit, and the first table drops units
// entirely. A unit per row is useless when reading down a column: 947 µs against 2.66 ms
// against 190 µs takes three conversions to see who won.
//
// Each renderer is measured in its own process, containing that renderer and nothing else.
//
// This is not fussiness. A process holding all seven measures none of them honestly:
// renderers/lit.js installs a global DOM shim on import, and @itsy/html once declared a
// String subclass that slowed every other library in the process by up to 2.8x, enough to
// reverse who won. Hence spec.js: it carries the case list and the module paths and
// imports no renderer, so a child can load exactly one.
//
// One library per process is also how a renderer runs in production.
//
// The clean cases get a process of their own too, apart from the same renderer's shared cases.
// The shared tables then come from the same processes as before the clean cases existed: the
// same code, warmed the same way. What else runs in a process moves its numbers (see warmup()
// in harness.js), and a table must not depend on which other table was measured beside it.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { do_not_optimize, measure } from 'mitata';
import {
  ATTR_CASES,
  ATTR_KEYS,
  ATTR_RENDERERS,
  CASES,
  CASE_KEYS,
  CLEAN_CASES,
  CLEAN_KEYS,
  CLEAN_RENDERERS,
  MIN_CPU_TIME,
  RENDERERS,
} from './spec.js';

// The cases one child measures: a renderer's shared cases (with attrs, where it can), or its
// clean ones.
const GROUPS = {
  shared: (spec) => (spec.shared === false ? [] : [...CASE_KEYS, ...(ATTR_RENDERERS.includes(spec.name) ? ATTR_KEYS : [])]),
  clean: (spec) => (CLEAN_RENDERERS.includes(spec.name) ? CLEAN_KEYS : []),
};

// Child: measure one group of one renderer and return the numbers as JSON. Note what is *not*
// imported above: harness.js pulls in every renderer, so the child must never touch it.
const only = process.argv[2];
if (only !== undefined) {
  const spec = RENDERERS[Number(only)];
  const r = (await import(spec.module))[spec.export];
  const keys = GROUPS[process.argv[3]](spec);

  // Warm the process. mitata warms each function it is given but not the process, and a case
  // measured cold reads ~30% slow.
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
// `ns[case][renderer]`. A renderer only fills the cases it ran, so each table reads only its own.
const ns = Object.fromEntries([...CASE_KEYS, ...ATTR_KEYS, ...CLEAN_KEYS].map((k) => [k, {}]));
for (const [i, spec] of RENDERERS.entries()) {
  for (const group of Object.keys(GROUPS)) {
    if (GROUPS[group](spec).length === 0) continue;
    if (process.stderr.isTTY) process.stderr.write(`\rmeasuring ${spec.name}, ${group}${' '.repeat(40)}`);
    const args = ['--expose-gc', self, String(i), group];
    const out = JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8' }));
    for (const [k, v] of Object.entries(out)) ns[k][spec.name] = v;
  }
}
if (process.stderr.isTTY) process.stderr.write(`\r${' '.repeat(60)}\r`);

// One unit for a whole column, chosen from the column median, not the fastest entry.
// The fastest is the unescaped baseline, and it would put the real contenders in the
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
const mean = (name, keys = CASE_KEYS) => Math.exp(keys.reduce((s, k) => s + Math.log(speed(k, name)), 0) / keys.length);
const order = [...contenders].sort((a, b) => mean(b.name) - mean(a.name));

// Both tables take their headers and cells from CASE_KEYS, so a case added in one place
// cannot end up labelled with another one's name.
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
const attrOrder = ATTR_RENDERERS.map((name) => ({ name })).sort((a, b) => ns.attrs[a.name] - ns.attrs[b.name]);
render(
  'Attributes from an object',
  'Ten links whose attribute names come from an object at render time, not from the template.\n' +
    'lit is absent because @lit-labs/ssr cannot render an element part; hono and ghtml because neither\n' +
    'has an attribute mechanism, so their rows would time our string builder rather than the library.',
  ['renderer', `${ATTR_CASES.attrs} (${unit(ns.attrs)[0]})`, 'vs hand-written'],
  attrOrder.map((r) => [
    r.name,
    fmt(ns.attrs[r.name] / unit(ns.attrs)[1]),
    (ns.attrs['hand-written (escape + concat)'] / ns.attrs[r.name]).toFixed(2),
  ]),
);

// The clean cases: `trusted` beside `html`, on the only data `trusted` is for.
const cleanOrder = [...CLEAN_RENDERERS].sort((a, b) => mean(b, CLEAN_KEYS) - mean(a, CLEAN_KEYS));
render(
  'Nothing to escape',
  `The same templates over data with nothing to escape, the only data trusted takes. ${baseline.name} is 1.00;\n` +
    'all four write the same bytes.',
  ['renderer', ...CLEAN_KEYS.map((k) => CLEAN_CASES[k]), 'overall'],
  cleanOrder.map((name) => [
    name,
    ...CLEAN_KEYS.map((k) => speed(k, name).toFixed(2)),
    mean(name, CLEAN_KEYS).toFixed(2),
  ]),
);
render(
  'Nothing to escape: time per render',
  'One unit per column. Lower is faster.',
  ['renderer', ...CLEAN_KEYS.map((k) => `${CLEAN_CASES[k]} (${unit(ns[k])[0]})`)],
  cleanOrder.map((name) => [name, ...CLEAN_KEYS.map((k) => fmt(ns[k][name] / unit(ns[k])[1]))]),
);

console.log();
