// Two builds of @itsy/html, side by side, in one process.
//
// Running `pnpm bench` twice and diffing the tables does not work: the same build drifts
// across processes. Over thirty measurements of byte-identical code in two runs, the
// median moved 0.9%, p90 3.5%, and the worst 4.4%. lit moved 4.3% with nothing changed.
// Anything under about 5% is invisible that way.
//
// So this script loads both builds at once. Every round times them back to back, in
// alternating order. The report is the median of the per-round *deltas*, not the
// difference of two separate medians. Drift inside a round hits both sides and cancels.
//
// Alternating alone is not enough. The side that runs second in a round inherits a warmer
// cache, so each delta carries a position bias. The median across rounds cancels it only
// if the two positions happen to balance around it. So each delta comes from a *pair* of
// rounds: one where HEAD went first and one where it went second. The bias cancels inside
// each sample instead of averaging out. Without this, an untouched case reads as a
// confident 1.4% regression.
//
// Usage: pnpm bench:vs [rev]     (rev defaults to main)
//
// Limit: this cannot measure a change with a process-global effect. Both builds share one
// process, so whatever one does to the process, it does to the other too, and the pairing
// cancels the very effect under test. Removing `class Html extends String` measured 1.75x
// to 2.89x with one build per process, but only +13% here: main's copy still deoptimised
// V8's string fast paths for both sides. For a change to builtins, prototypes or globals
// rather than this library's own code, measure one build per process instead, and accept
// the ~4% cross-process noise floor as the price of an honest answer.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { do_not_optimize, measure } from 'mitata';
import { ATTR_CASES, ATTR_KEYS, CASES, CASE_KEYS } from './spec.js';
import { make } from './renderers/itsy.js';
import current from './renderers/itsy.js';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const rev = process.argv[2] ?? 'main';

/**
 * Build `rev`'s src into a throwaway directory.
 *
 * No worktree and no second install. src/ imports only its own relative paths, so
 * `git archive` is enough. The config is a plain object literal, not a defineConfig()
 * call, so the temp directory needs no node_modules of its own.
 */
const buildBaseline = (tmp) => {
  const tar = join(tmp, 'src.tar');
  execFileSync('git', ['archive', rev, 'src', '-o', tar], { cwd: root });
  execFileSync('tar', ['-xf', tar, '-C', tmp]);

  // __DEV__ must be replaced here, and the CLI has no --define flag. Without it the
  // identifier survives into the bundle, the dev-only markup audit never shakes out, and
  // the first render throws ReferenceError.
  writeFileSync(
    join(tmp, 'tsdown.config.mjs'),
    `export default ${JSON.stringify(
      {
        entry: { index: join(tmp, 'src/index.ts'), create: join(tmp, 'src/create.ts') },
        define: { __DEV__: 'false' },
        format: ['esm'],
        platform: 'neutral',
        target: 'es2022',
        dts: false,
        treeshake: true,
        minify: true,
        clean: true,
        hash: false,
        outDir: join(tmp, 'dist'),
      },
      null,
      2,
    )};\n`,
  );
  execFileSync(join(root, 'node_modules/.bin/tsdown'), ['--config', join(tmp, 'tsdown.config.mjs'), '-l', 'error'], {
    cwd: root,
  });
  // No package.json in the temp dir, so tsdown writes .mjs.
  return { index: join(tmp, 'dist/index.mjs'), create: join(tmp, 'dist/create.mjs') };
};

// Same TTY guard as harness.js. Progress is for a person watching and must not land in
// a file when the output is piped.
const note = (text) => {
  if (process.stderr.isTTY) process.stderr.write(`\r${' '.repeat(50)}\r${text}`);
};

// The smallest change this method reports as real, in percent.
//
// This is measured, not guessed. Comparing a revision against *itself*, where the true
// effect is zero, still produces bands that exclude zero. Two builds in one process differ
// in module layout, load order and code alignment, and the paired statistic is precise
// enough to see that. The effect is real and reproducible but unrelated to the source
// change. It is not a GC artefact: the false-positive rate is the same with --expose-gc
// and a real collector as without it.
//
// The whole band must clear this, not just the median. Testing the median alone let
// through about one bogus row per self-comparison, such as -2.1% (-3.7 … -0.8), whose
// near edge is far from the floor. Requiring the near edge to clear it removes those and
// keeps every real signal: the smallest genuine change measured here, the URL-guard
// probe, reads +7.9% (6.5 … 9.0). The floor is three, not two, because at two a band
// still grazed it now and then: one row in forty-odd, always around -2.0.
//
// After changing the timing, re-run `node ab.js <this revision>`. If it reports a change
// on identical source, this floor is too low.
const FLOOR = 3;

const pct = (xs, p) => xs.slice().sort((a, b) => a - b)[Math.floor(p * (xs.length - 1))];
const fmt = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(2)} ms` : v >= 1e3 ? `${(v / 1e3).toFixed(2)} µs` : `${v.toFixed(0)} ns`);

const tmp = mkdtempSync(join(tmpdir(), 'itsy-ab-'));
try {
  process.stderr.write(`building ${rev}…\n`);
  const out = buildBaseline(tmp);
  const exports = { ...(await import(out.index)), ...(await import(out.create)) };
  const before = make({ html: exports.html, attrs: exports.attrs, createHtml: exports.createHtml });

  // Everything worth diffing, flattened: the shared cases, then the two @itsy/html-only
  // groups. `cold` is the template scan. `probes` are the attrs paths the shared case
  // cannot reach, because it must stay byte-identical to preact.
  const subjects = [
    ...CASE_KEYS.map((k) => ({ label: CASES[k], a: current[k], b: before[k] })),
    ...ATTR_KEYS.map((k) => ({ label: ATTR_CASES[k], a: current[k], b: before[k] })),
    { label: 'first render of a call site', a: current.cold, b: before.cold },
    ...Object.keys(current.probes).map((n) => ({ label: n, a: current.probes[n], b: before.probes[n] })),
  ];

  // Same library, so the two builds must agree byte for byte. This matters: an Html value
  // from one build is not `instanceof` the other's. If the two renderers ever shared one,
  // it would be escaped instead of passed through, silently and only in the nested cases.
  // A behaviour change between the revisions also trips this, and that is worth stopping
  // for before reading any timings.
  for (const { label, a, b } of subjects) {
    if (a() !== b()) {
      throw new Error(
        `${label}: the two builds render differently.\n  HEAD  ${a().slice(0, 120)}\n  ${rev}  ${b().slice(0, 120)}`,
      );
    }
  }

  const rounds = 16; // even: every round is half of an order-cancelling pair

  // Many short measurements. The pairing needs many rounds more than long ones, and
  // mitata's 642 ms default would take a minute per case.
  const at = async (fn) => (await measure(() => do_not_optimize(fn()), { min_cpu_time: 40e6 })).p50;

  for (let i = 0; i < 12; i++) for (const { a, b } of subjects) (a(), b());

  const rows = [];
  for (const { label: k, a: fnA, b: fnB } of subjects) {
    const a = [];
    const b = [];
    for (let r = 0; r < rounds; r++) {
      note(`round ${r + 1}/${rounds}  ${k}`);
      // Alternate which goes first, so a warming or cooling trend cannot favour one side.
      if (r % 2 === 0) {
        a.push(await at(fnA));
        b.push(await at(fnB));
      } else {
        b.push(await at(fnB));
        a.push(await at(fnA));
      }
    }
    // One sample per adjacent pair of rounds: one HEAD-first round plus one HEAD-second
    // round. The position advantage is inside both sums and divides out.
    const deltas = [];
    for (let r = 0; r + 1 < rounds; r += 2) {
      const ha = a[r] + a[r + 1];
      const hb = b[r] + b[r + 1];
      deltas.push(((hb - ha) / hb) * 100); // positive = HEAD is faster
    }
    rows.push({ k, a: pct(a, 0.5), b: pct(b, 0.5), d: pct(deltas, 0.5), lo: pct(deltas, 0.1), hi: pct(deltas, 0.9) });
  }
  note('');

  const w = Math.max(...rows.map((r) => r.k.length), 8);
  console.log(`\n### HEAD vs ${rev}\n`);
  console.log(`Positive means HEAD is faster. Paired per round; the band is the 10th-90th percentile`);
  console.log(`of the per-round delta. A row reads as noise unless that whole band clears ${FLOOR}%:`);
  console.log(`comparing a revision against itself moves about that much, so less cannot be attributed.`);
  console.log(`Both columns run slower here than in table.js — two builds in one process share call`);
  console.log(`sites and caches. It costs both sides the same, so the change column is unaffected.\n`);
  console.log(`${'case'.padEnd(w)}  ${rev.slice(0, 10).padStart(10)}  ${'HEAD'.padStart(10)}   change`);
  console.log('-'.repeat(w + 26 + 22));
  for (const r of rows) {
    // Noise unless the band excludes zero *and* its near edge clears the floor.
    const noisy = (r.lo <= 0 && r.hi >= 0) || Math.min(Math.abs(r.lo), Math.abs(r.hi)) < FLOOR;
    const change = noisy
      ? 'within noise'
      : `${r.d > 0 ? '+' : ''}${r.d.toFixed(1)}%   (${r.lo.toFixed(1)} … ${r.hi.toFixed(1)})`;
    console.log(`${r.k.padEnd(w)}  ${fmt(r.b).padStart(10)}  ${fmt(r.a).padStart(10)}   ${change}`);
  }
  console.log();
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
