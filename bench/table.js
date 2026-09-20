// The same measurements as server.js, printed so they can be compared by eye.
//
// mitata's own output picks a unit per row, which is right when you are reading
// one row and useless when you are reading down a column: 947 µs against 2.66 ms
// against 190 µs is three conversions before you know who won. Here every column
// gets one unit, and the first table drops units entirely.

import { do_not_optimize, measure } from 'mitata';
import { escaped, raw } from './renderers/baseline.js';
import ghtml from './renderers/ghtml.js';
import hono from './renderers/hono.js';
import itsy from './renderers/itsy.js';
import lit from './renderers/lit.js';
import preact from './renderers/preact.js';

const contenders = [itsy, hono, ghtml, preact, lit, escaped, raw];

const CASES = {
  link: 'one <a>',
  card: 'one element',
  page: 'nested page',
  table: '1000 rows',
  escape: 'escape-heavy',
};

// Same fairness guard as server.js: nothing is timed until every renderer has
// been shown to render all the rows and escape what it was given.
for (const r of contenders) {
  const rows = (r.table().match(/<tr[ >]/g) ?? []).length;
  if (rows !== 1000) throw new Error(`${r.name}: rendered ${rows} rows, expected 1000`);
  if (!r.unsafe && r.escape().includes('<script>')) throw new Error(`${r.name}: left a <script> unescaped`);
}

// avg[case][renderer] in nanoseconds.
const avg = {};
for (const key of Object.keys(CASES)) {
  avg[key] = {};
  for (const r of contenders) {
    if (process.stderr.isTTY) process.stderr.write(`\rmeasuring ${key} / ${r.name}${' '.repeat(20)}`);
    // do_not_optimize, or V8 sees the result is unused and hoists the whole render away.
    const fn = r[key];
    avg[key][r.name] = (await measure(() => do_not_optimize(fn()), { min_cpu_time: 5e8 })).avg;
  }
}
if (process.stderr.isTTY) process.stderr.write(`\r${' '.repeat(60)}\r`);

// One unit for a whole column, chosen from the column median. Not from the fastest
// entry: that is the unescaped baseline, and it would put the real contenders in the
// thousands of the unit below.
const unit = (key) => {
  const sorted = Object.values(avg[key]).sort((a, b) => a - b);
  const ns = sorted[sorted.length >> 1];
  return ns < 1e3 ? ['ns', 1] : ns < 1e6 ? ['µs', 1e3] : ['ms', 1e6];
};

const render = (title, note, head, rows) => {
  const cols = [head[0], ...head.slice(1)];
  const width = cols.map((c, i) => Math.max(c.length, ...rows.map((r) => r[i].length)));
  const line = (cells) =>
    `| ${cells.map((c, i) => (i === 0 ? c.padEnd(width[i]) : c.padStart(width[i]))).join(' | ')} |`;
  console.log(`\n### ${title}\n\n${note}\n`);
  console.log(line(cols));
  console.log(`| ${width.map((w, i) => (i === 0 ? '-'.repeat(w) : `${'-'.repeat(w - 1)}:`)).join(' | ')} |`);
  for (const r of rows) console.log(line(r));
};

// Relative to @itsy/html, so a reader can see the gap without doing arithmetic.
const speed = (key, name) => avg[key][itsy.name] / avg[key][name];
const mean = (name) => Math.exp(Object.keys(CASES).reduce((s, k) => s + Math.log(speed(k, name)), 0) / 5);
const order = [...contenders].sort((a, b) => mean(b.name) - mean(a.name));

render(
  'Relative speed',
  'Higher is faster. @itsy/html is 1.00 in every column, so 2.11 means twice as fast as it and 0.50 means half.',
  ['renderer', ...Object.values(CASES), 'overall'],
  order.map((r) => [
    r.name,
    ...Object.keys(CASES).map((k) => speed(k, r.name).toFixed(2)),
    mean(r.name).toFixed(2),
  ]),
);

render(
  'Time per render',
  'One unit per column. Lower is faster.',
  ['renderer', ...Object.entries(CASES).map(([k, label]) => `${label} (${unit(k)[0]})`)],
  order.map((r) => [
    r.name,
    ...Object.keys(CASES).map((k) => {
      const [, div] = unit(k);
      const v = avg[k][r.name] / div;
      return v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
    }),
  ]),
);

console.log();
