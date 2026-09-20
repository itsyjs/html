// The contenders, the fairness guard, and a timer that gives the same answer twice.
//
// Timing here used to lean on an accident. `measure()` from mitata reads whatever
// state the V8 heap happens to be in, and the first thing timed in a fresh process
// pays for growing it: @itsy/html measured 240 ns on the link case after other work
// had run and 440 ns when it went first, from the same build. The old table.js was
// only stable because its verify() guard ran every renderer before any measurement
// and warmed the heap by chance. Take the guard away and every number moves.
//
// So: warm everything, calibrate everything, and only then record. Each round times
// every renderer of a case back to back, so drift during the run hits all of them
// together, and the published figure is the median round rather than the best one.

import { do_not_optimize } from 'mitata';
import { escaped, raw } from './renderers/baseline.js';
import ghtml from './renderers/ghtml.js';
import hono from './renderers/hono.js';
import itsy from './renderers/itsy.js';
import lit from './renderers/lit.js';
import preact from './renderers/preact.js';

export const contenders = [itsy, hono, ghtml, preact, lit, escaped, raw];
export const baseline = itsy;
export const CASE_KEYS = ['link', 'card', 'page', 'table', 'escape'];

/** Prove each renderer really rendered every row and really escaped, before any of it is timed. */
export const verify = () => {
  for (const r of contenders) {
    const rows = (r.table().match(/<tr[ >]/g) ?? []).length;
    if (rows !== 1000) throw new Error(`${r.name}: rendered ${rows} rows, expected 1000`);
    if (!r.unsafe && r.escape().includes('<script>')) throw new Error(`${r.name}: left a <script> unescaped`);
  }
};

const note = (text) => {
  if (process.stderr.isTTY) process.stderr.write(`\r${text}${' '.repeat(Math.max(0, 52 - text.length))}`);
};
const clear = () => {
  if (process.stderr.isTTY) process.stderr.write(`\r${' '.repeat(60)}\r`);
};

// Nanoseconds per call, over a batch. do_not_optimize, or V8 sees the result is
// unused and hoists the whole render away. One timer reading per batch, not per
// call, so the clock's own cost is divided by `n` rather than charged to each one.
const time = (fn, n) => {
  const start = process.hrtime.bigint();
  for (let i = 0; i < n; i++) do_not_optimize(fn());
  return Number(process.hrtime.bigint() - start) / n;
};

/** Run everything a few times, so no recorded timing is the one that grows the heap. */
export const warmup = (keys = CASE_KEYS, passes = 12) => {
  for (let i = 0; i < passes; i++) {
    for (const r of contenders) for (const k of keys) r[k]();
  }
};

// How many calls make one batch last `target`. A batch that long is well above timer
// noise; a fixed count would give lit a 100x longer batch than the unescaped baseline.
const calibrate = (fn, target) => {
  let n = 1;
  for (let guard = 0; guard < 40; guard++) {
    const per = time(fn, n);
    if (per * n >= target) return n;
    n = Math.min(Math.max(n * 2, Math.ceil(target / per)), 5_000_000);
  }
  return n;
};

/**
 * Nanoseconds per call for every renderer and every case: `ns[case][renderer name]`,
 * the median of `rounds` batches.
 *
 * Writes a warning to stderr if any measurement moved around enough during the run
 * that the numbers should not be trusted — a machine doing something else at the time.
 *
 * @param keys Which cases to time.
 * @param options `target` is how long one batch should take, `rounds` how many to run.
 */
export const measureAll = (keys = CASE_KEYS, { target = 15e6, rounds = 20 } = {}) => {
  warmup(keys);

  // Calibrate all of them before recording any of them, so the heap has stopped
  // growing by the time the first number is kept.
  const iters = {};
  for (const k of keys) {
    iters[k] = new Map();
    for (const r of contenders) {
      note(`calibrating ${k} / ${r.name}`);
      iters[k].set(r, calibrate(r[k], target));
    }
  }

  const samples = {};
  for (const k of keys) {
    samples[k] = {};
    for (const r of contenders) samples[k][r.name] = [];
  }

  for (let round = 0; round < rounds; round++) {
    for (const k of keys) {
      for (const r of contenders) {
        note(`round ${round + 1}/${rounds}  ${k} / ${r.name}`);
        samples[k][r.name].push(time(r[k], iters[k].get(r)));
      }
    }
  }
  clear();

  const ns = {};
  const shaky = [];
  for (const k of keys) {
    ns[k] = {};
    for (const r of contenders) {
      const xs = samples[k][r.name].sort((a, b) => a - b);
      const median = xs[xs.length >> 1];
      ns[k][r.name] = median;
      // How far the slower half ran from the fastest round. A quiet machine sits
      // under a few percent; a noisy one does not, and then the table is fiction.
      const spread = (xs[Math.floor(xs.length * 0.75)] - xs[0]) / xs[0];
      if (spread > 0.15) shaky.push(`${k}/${r.name} ±${(spread * 100).toFixed(0)}%`);
    }
  }
  if (shaky.length > 0) {
    process.stderr.write(
      `\nwarning: these moved around during the run, so treat them as rough:\n  ${shaky.join('\n  ')}\n` +
        `  (close other work and run again; the ratios survive this better than the absolute times)\n`,
    );
  }
  return ns;
};
