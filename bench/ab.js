// Two builds of @itsy/html, side by side, in one process.
//
// Running `pnpm bench` twice and diffing the tables does not work: across processes the
// same build drifts. Thirty measurements of byte-identical code across two runs moved a
// median of 0.9%, p90 3.5%, and 4.4% at worst — lit moved 4.3% with nothing changed at
// all. Anything under about 5% is invisible that way.
//
// So both builds are loaded here at once and every round times them back to back, with
// the order alternating. What is reported is the median of the per-round *deltas*, not
// the difference of two independently-taken medians: drift inside a round hits both
// sides and cancels, which is the whole point.
//
// Alternating is not quite enough on its own. Whichever side runs second in a round
// inherits a warmer cache, so a delta taken from one round carries that position bias,
// and the median across rounds only cancels it if the two positions happen to be evenly
// balanced either side of it. Deltas are therefore taken from *pairs* of rounds — one
// where HEAD went first and one where it went second — so the bias cancels inside each
// sample rather than being left to average out. Without this, an untouched case reads a
// confident 1.4% regression.
//
// Usage: pnpm bench:vs [rev]     (rev defaults to main)
//
// One thing this cannot measure: a change whose effect is process-global. Both builds are
// loaded here at once, so whichever of them does something to the whole process does it to
// the other one too, and the pairing cancels the very thing you wanted to see. Removing the
// `class Html extends String` — worth 1.75x to 2.89x measured one build per process — showed
// up here as +13%, because main's copy was still poisoning V8's string fast paths for both
// sides. When a change touches builtins, prototypes or globals rather than just this
// library's own code, measure it with one build per process instead and take the ~4%
// cross-process noise floor as the cost of an honest answer.

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
 * No worktree and no second install: src/ imports nothing but its own relative paths, so
 * `git archive` is enough, and the config is a plain object literal rather than a
 * defineConfig() call so the temp directory needs no node_modules of its own.
 */
const buildBaseline = (tmp) => {
  const tar = join(tmp, 'src.tar');
  execFileSync('git', ['archive', rev, 'src', '-o', tar], { cwd: root });
  execFileSync('tar', ['-xf', tar, '-C', tmp]);

  // __DEV__ must be replaced here. There is no --define flag on the CLI, and without it
  // the identifier survives into the bundle, the dev-only markup audit never shakes out,
  // and the first render throws ReferenceError.
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

// Same TTY guard as harness.js: progress is for a human watching, and must not land in
// a file when the output is piped.
const note = (text) => {
  if (process.stderr.isTTY) process.stderr.write(`\r${' '.repeat(50)}\r${text}`);
};

// Smallest change this method will call real, in percent.
//
// Not a guess. Comparing a revision against *itself* — where the true effect is zero by
// construction — still produces bands that do not contain zero: two builds in one process
// differ in module layout, load order and code alignment, and the paired statistic is
// precise enough to measure that faithfully. It is real, reproducible, has nothing to do
// with the source change, and is not garbage: the false-positive rate is the same with
// --expose-gc and a real collector as without it.
//
// The whole band has to clear this, not just the median. Testing the median alone let
// through roughly one bogus row per self-comparison — things like -2.1% (-3.7 … -0.8),
// where the near edge is nowhere near the floor. Requiring the near edge to clear it
// removes those without touching any real signal: the smallest genuine change measured
// here, the URL-guard probe, reads +7.9% (6.5 … 9.0). Three rather than two because at two
// a band would still occasionally graze it — one row in forty-odd, always around -2.0.
//
// Re-run `node ab.js <this revision>` after touching the timing; if it reports a change
// on identical source, this is too low.
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
  // groups. `cold` is the template scan, and `probes` are the attrs paths the shared case
  // cannot reach because it has to stay byte-identical to preact.
  const subjects = [
    ...CASE_KEYS.map((k) => ({ label: CASES[k], a: current[k], b: before[k] })),
    ...ATTR_KEYS.map((k) => ({ label: ATTR_CASES[k], a: current[k], b: before[k] })),
    { label: 'first render of a call site', a: current.cold, b: before.cold },
    ...Object.keys(current.probes).map((n) => ({ label: n, a: current.probes[n], b: before.probes[n] })),
  ];

  // Same library, so the two builds must agree byte for byte. This is not a formality:
  // an Html value from one build is not `instanceof` the other's, so if the two renderers
  // ever shared one, it would be escaped instead of passed through — silently, and only
  // in the nested cases. A behaviour change between the revisions trips this too, which
  // is worth stopping for before reading any timings.
  for (const { label, a, b } of subjects) {
    if (a() !== b()) {
      throw new Error(
        `${label}: the two builds render differently.\n  HEAD  ${a().slice(0, 120)}\n  ${rev}  ${b().slice(0, 120)}`,
      );
    }
  }

  const rounds = 16; // even: every round is half of an order-cancelling pair

  // Short measurements, many of them. The pairing needs rounds more than it needs any one
  // round to be long, and mitata's own 642 ms default would make this a minute per case.
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
    // One sample per adjacent pair of rounds, which is exactly one HEAD-first round plus
    // one HEAD-second round, so the position advantage is inside both sums and divides out.
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
