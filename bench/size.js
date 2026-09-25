// Bytes produced by each renderer for the same page.
//
// Throughput is not the only cost of an SSR renderer: its output crosses the wire
// on every request. lit's hydration markers are the reason this file exists.

import { CASES, CASE_KEYS, baseline, contenders, verify } from './harness.js';

// Same guard as the timed entry points. Byte counts for a renderer that rendered
// nothing, or failed to escape, are worse than none at all.
verify();

const bytes = (s) => Buffer.byteLength(s, 'utf8');
const want = Object.fromEntries(CASE_KEYS.map((c) => [c, bytes(baseline[c]())]));

const pad = (s, n) => String(s).padEnd(n);
const num = (s, n) => String(s).padStart(n);

console.log(`\noutput bytes, and the ratio to ${baseline.name}\n`);
console.log(pad('renderer', 32) + CASE_KEYS.map((c) => num(CASES[c], 18)).join(''));
console.log('-'.repeat(32 + CASE_KEYS.length * 18));

for (const r of contenders) {
  const cells = CASE_KEYS.map((c) => {
    const b = bytes(r[c]());
    const ratio = (b / want[c]).toFixed(2);
    return num(`${b.toLocaleString('en-US')} (${ratio}x)`, 18);
  });
  console.log(pad(r.name, 32) + cells.join(''));
}
console.log();
