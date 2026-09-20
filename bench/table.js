// The same measurements as server.js, printed so they can be compared by eye.
//
// mitata's own output picks a unit per row, which is right when you are reading
// one row and useless when you are reading down a column: 947 µs against 2.66 ms
// against 190 µs is three conversions before you know who won. Here every column
// gets one unit, and the first table drops units entirely.
//
// The timing itself lives in harness.js, which explains why it is not mitata's.

import { CASE_KEYS, baseline, contenders, measureAll, verify } from './harness.js';

const CASES = {
  link: 'one <a>',
  card: 'one element',
  page: 'nested page',
  table: '1000 rows',
  escape: 'escape-heavy',
};

verify();

// ns[case][renderer name]
const ns = measureAll(CASE_KEYS);

// One unit for a whole column, chosen from the column median. Not from the fastest
// entry: that is the unescaped baseline, and it would put the real contenders in the
// thousands of the unit below.
const unit = (key) => {
  const sorted = Object.values(ns[key]).sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1];
  return median < 1e3 ? ['ns', 1] : median < 1e6 ? ['µs', 1e3] : ['ms', 1e6];
};

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
const mean = (name) =>
  Math.exp(CASE_KEYS.reduce((s, k) => s + Math.log(speed(k, name)), 0) / CASE_KEYS.length);
const order = [...contenders].sort((a, b) => mean(b.name) - mean(a.name));

render(
  'Relative speed',
  `Higher is faster. ${baseline.name} is 1.00 in every column, so 2.11 means twice as fast as it and 0.50 means half.`,
  ['renderer', ...Object.values(CASES), 'overall'],
  order.map((r) => [r.name, ...CASE_KEYS.map((k) => speed(k, r.name).toFixed(2)), mean(r.name).toFixed(2)]),
);

render(
  'Time per render',
  'One unit per column. Lower is faster.',
  ['renderer', ...CASE_KEYS.map((k) => `${CASES[k]} (${unit(k)[0]})`)],
  order.map((r) => [
    r.name,
    ...CASE_KEYS.map((k) => {
      const v = ns[k][r.name] / unit(k)[1];
      return v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
    }),
  ]),
);

console.log();
