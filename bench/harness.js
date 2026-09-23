// The contenders, the case list, the fairness guard, and a thin wrapper over mitata.
//
// Timing used to be hand-rolled here: a batch timer, a calibration loop and a median of
// twenty rounds. The reason was that mitata's measure() read whatever state the V8 heap
// was in, and whichever renderer went first paid for growing it: 240 ns against 440 ns
// from the same build. That is still true, and `warmup()` below handles it.
//
// The rest of the hand-rolled timer was not worth keeping. measure() builds its timing
// loop with new AsyncFunction, so every benchmark gets freshly compiled code and its own
// monomorphic call site. The hand-rolled timer sent everything through one shared `fn()`,
// which went polymorphic and could not inline the callee. That added up to 30% overhead
// to the fastest cases. On two implementations of one small function it inverted the
// result: the scanning escaper read 0.29x when the truth is 1.37x. measure() is also
// about twice as fast over the same matrix.
//
// Note: importing this file imports renderers/lit.js, whose first line installs a
// global DOM shim process-wide. Every entry point that imports the harness gets it,
// including size.js, whether or not it measures lit.

import { do_not_optimize, measure } from 'mitata';
import { CASE_KEYS, MIN_CPU_TIME } from './spec.js';
import { escaped, raw } from './renderers/baseline.js';
import ghtml from './renderers/ghtml.js';
import hono from './renderers/hono.js';
import itsy from './renderers/itsy.js';
import lit from './renderers/lit.js';
import preact from './renderers/preact.js';

export const contenders = [itsy, hono, ghtml, preact, lit, escaped, raw];
export const baseline = itsy;

export { ATTR_CASES, ATTR_KEYS, CASES, CASE_KEYS } from './spec.js';
export const attrContenders = [itsy, preact, escaped];

/**
 * Prove each renderer really rendered every row, really escaped, and still matches
 * @itsy/html byte for byte wherever it ever did.
 *
 * Not every renderer can match: ghtml emits numeric entities and escapes `=`, lit emits
 * `<!--lit-part-->` markers, and preact's escaper leaves `>` and `'` alone. Each renderer
 * declares these in a `differs` map with a reason. An entry that stops being true also
 * fails here, so an exemption cannot outlive the thing it excused.
 */
export const verify = () => {
  for (const r of contenders) {
    const rows = (r.table().match(/<tr[ >]/g) ?? []).length;
    if (rows !== 1000) throw new Error(`${r.name}: rendered ${rows} rows, expected 1000`);
    if (!r.unsafe && r.escape().includes('<script>')) throw new Error(`${r.name}: left a <script> unescaped`);
  }

  for (const k of CASE_KEYS) {
    const want = baseline[k]();
    for (const r of contenders) {
      if (r === baseline || r.unsafe) continue; // `raw` is here to be different
      const why = r.differs?.[k];
      const same = r[k]() === want;
      if (why && same) {
        throw new Error(`${r.name}/${k}: matches ${baseline.name} again — drop the differs entry ("${why}")`);
      }
      if (!why && !same) {
        throw new Error(`${r.name}/${k}: output no longer matches ${baseline.name}, and nothing says it may`);
      }
    }
  }

  // The attrs case has no exemptions: its fixture was chosen so all three can agree.
  const wantAttrs = baseline.attrs();
  for (const r of attrContenders) {
    if (r.attrs() !== wantAttrs) throw new Error(`${r.name}/attrs: output does not match ${baseline.name}`);
  }
};

const note = (text) => {
  if (process.stderr.isTTY) process.stderr.write(`\r${text}${' '.repeat(Math.max(0, 52 - text.length))}`);
};
const clear = () => {
  if (process.stderr.isTTY) process.stderr.write(`\r${' '.repeat(60)}\r`);
};

/**
 * Run everything a few times, so no recorded timing is the one that grows the heap.
 *
 * measure() cannot do this. Its own warmup is three calls behind a threshold, and raising
 * `warmup_samples` to a million changes nothing.
 *
 * **Warm only the renderer about to be measured.** Warming all of them together is not
 * neutral. It makes @itsy/html read 1.75x faster, the hand-written baseline 2.28x, ghtml
 * 1.44x and preact 1.29x, while hono and lit do not move. Running hono's code causes it,
 * and the effect is large enough to reverse who wins. So table.js measures each renderer
 * in its own process; see the comment there.
 */
export const warmup = (keys = CASE_KEYS, who = contenders, passes = 12) => {
  for (let i = 0; i < passes; i++) {
    for (const r of who) for (const k of keys) r[k]();
  }
};

// A note on GC, because the options here are a trap.
//
// By default mitata collects before each measurement. When `globalThis.gc` is missing, it
// provokes a collection by allocating a 1 GB Uint8Array. The bench scripts pass
// `--expose-gc` so it gets the real collector instead. The numbers do not move either way:
// the run-to-run spread on the 1000-row case is about 1% with the flag and without it. So
// this is hygiene, not accuracy.
//
// Avoid `inner_gc`. It looks like the careful choice and is the opposite: per-iteration GC
// accounting took the spread on that same case from 1.1% to 13.7% and inflated the median
// by 10%.
//
// Neither option touches the two things that really move numbers here. The gap between a
// cold and a warm process (36%) is JIT tier-up, which `warmup()` above handles, and the
// real collector leaves it unchanged. The residual artefact that sets ab.js's floor is also
// unchanged: its false-positive rate on identical source is the same either way.

/**
 * Nanoseconds per call for every renderer and every case: `ns[case][renderer name]`, as
 * mitata's median sample. Call `warmup()` first.
 *
 * Writes a warning to stderr if any measurement moved enough during the run to make the
 * numbers untrustworthy, as when the machine is busy with other work.
 *
 * @param keys Which cases to time.
 * @param who Which renderers to time them on. Defaults to all of them.
 */
export const measureAll = async (keys = CASE_KEYS, who = contenders) => {
  const ns = {};
  const shaky = [];
  for (const k of keys) {
    ns[k] = {};
    for (const r of who) {
      note(`measuring ${k} / ${r.name}`);
      const s = await measure(() => do_not_optimize(r[k]()), { min_cpu_time: MIN_CPU_TIME });
      ns[k][r.name] = s.p50;
      // How far the slower half ran from the fastest sample. A quiet machine stays under
      // a few percent. A noisy one does not, and then the table is fiction.
      const spread = (s.p75 - s.min) / s.min;
      if (spread > 0.15) shaky.push(`${k}/${r.name} ±${(spread * 100).toFixed(0)}%`);
    }
  }
  clear();
  if (shaky.length > 0) {
    process.stderr.write(
      `\nwarning: these moved around during the run, so treat them as rough:\n  ${shaky.join('\n  ')}\n` +
        `  (close other work and run again; the ratios survive this better than the absolute times)\n`,
    );
  }
  return ns;
};
