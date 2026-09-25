# bench

Not part of the package, and not installed with it. Its own `package.json` so the root
install stays small, and its own `node_modules`, because it pulls in four other renderers.

Two questions, two tools:

```sh
pnpm bench            # how fast are we, against the others
pnpm bench:vs [rev]   # did a change here make a difference (rev defaults to main)
pnpm bench:size       # what we put on the wire, against the others
```

Each runs `tsdown` first, so the numbers always come from current source rather than
whatever was in `dist` last. To run one directly:

```sh
pnpm install --ignore-workspace
node table.js       # the comparison tables
node ab.js [rev]    # HEAD against another revision, both in one process
node size.js        # bytes emitted
```

`--ignore-workspace` is needed because the repo root has a `pnpm-workspace.yaml` that does
not list this directory, and pnpm would otherwise decide there is nothing to install.

## How things are timed

Everything is timed by [mitata](https://github.com/evanwashere/mitata). `harness.js` holds
the contenders, the case list, the fairness guard, and a thin wrapper over its `measure()`.

The one thing mitata cannot do is warm the *process*. Measured cold, the link case
reads 224 ns; once every renderer has run once, 164 ns. So `warmup()` runs before anything
is measured — that is what the harness was originally built around, and the part worth
keeping. That gap is JIT tier-up, not garbage: it is still 39% with a real collector wired up.

The scripts pass `--expose-gc`. mitata collects before each measurement by default, and
without that flag it provokes one by allocating a 1 GB `Uint8Array`; with it, it uses the real
collector. The numbers do not move either way — about 1% run-to-run spread on the 1000-row
case with the flag and without — so this is hygiene rather than accuracy. Do **not** turn on
`inner_gc`: per-iteration GC accounting took that same spread from 1.1% to 13.7% and inflated
the median by 10%.

The timing used to be hand-rolled here: a batch timer, a calibration loop, and a median of
twenty rounds. It is gone. mitata compiles a fresh loop per benchmark with
`new AsyncFunction`, so each gets its own monomorphic call site, where the hand-rolled timer
put everything through a single shared `fn()` that went polymorphic and could not inline the
callee. That cost the fastest cases up to 30% in pure overhead, and comparing two
implementations of one small function it inverted the answer outright.

Cases live in one place, `CASES` in `harness.js`, and every table takes both its keys and
its labels from there.

## Comparing two revisions

`pnpm bench` answers "how does this compare to other libraries". `pnpm bench:vs` answers
"did my change make it faster", which is a different question and needs a different method.

Running `pnpm bench` twice and diffing the tables does not work. Across processes the same
build drifts: thirty measurements of byte-identical code across two runs moved a median of
0.9%, p90 3.5%, and 4.4% at worst — lit moved 4.3% with nothing changed at all. Anything
under about 5% is invisible that way.

So `ab.js` loads both builds into one process and times them back to back inside each round,
alternating which goes first. Deltas are taken from *pairs* of rounds — one where HEAD went
first and one where it went second — so the position advantage cancels inside each sample
rather than being left to average out. What is reported is the median of those deltas, with
a 10th-90th percentile band; a band spanning zero reads as noise.

A row only counts as a change if its whole band clears 3%. That floor is measured, not
guessed: comparing a revision against *itself*, where the true effect is zero, still produces
bands that exclude zero — two builds in one process differ in module layout, load order and
code alignment, and the paired statistic is precise enough to measure that faithfully. It is
real, reproducible, nothing to do with the source change, and not garbage collection: the
false-positive rate on identical source is the same with a real collector as without one.

Testing the *whole band* rather than the median matters. Against the median alone, roughly one
bogus row slipped through per self-comparison — things like `-2.1% (-3.7 … -0.8)`, where the
near edge is nowhere near the floor. Neither rule costs any real signal: the smallest genuine
change measured here, the URL-guard probe, reads +6.7% (5.7 … 8.4).

Alongside the shared cases it measures the clean cases, through `html` and through `trusted`,
and two `@itsy/html`-only groups: `cold`, the one-off template scan, and `probes` from
`renderers/itsy.js` — the `attrs()` paths the shared case cannot reach, because that one has to
stay byte-identical to preact and so gives up `cx()`'s array form and any URL the guard would
rewrite. A revision without `trusted` has its `trusted` rows left out, with a note saying so.

The baseline is built by `git archive`-ing that revision's `src/` into a temp directory and
running `tsdown` over it: no worktree, no second install, and the same `__DEV__: false`
production settings on both sides. Absolute numbers run higher there than in `table.js`,
because two builds in one process share call sites and caches; it costs both sides the same,
so the change column is unaffected.

Sanity check, and a good one after touching `ab.js`: `pnpm bench:vs main` from `main` must
report noise on every row. If it reports a change, the floor is too low.

It cannot measure a change whose effect is process-global, because both builds share the
process: whatever one of them does to V8 it does to the other, and the pairing cancels the very
thing being measured. Dropping `class Html extends String` was worth 1.75x to 2.89x measured
one build per process, and `bench:vs` reported +13% — main's copy was still deoptimising string
methods for both sides. For a change that touches builtins, prototypes or globals rather than
just this library's own code, measure one build per process and accept the ~4% cross-process
noise floor as the price of an honest answer.

## What is measured

Template in, escaped HTML string out — the whole job, inside the timed function.

That last part is why lit appears as `lit + @lit-labs/ssr` rather than `lit`. Lit's `html`
renders nothing; it returns a `TemplateResult`, and the work happens later, in `lit-html`'s
`render()` against the DOM or in `@lit-labs/ssr`'s against a string. Timing `html` against
`html` would compare an object allocation to a full escape-and-concatenate, and @itsy/html
would win a race the other library never entered.

Every renderer is one small file under `renderers/`, holding the same templates, so the
comparison can be checked by reading them side by side. Before anything is timed or counted,
`verify()` asserts each one rendered all 1000 rows, left no `<script>` unescaped, and still
matches @itsy/html byte for byte on every case where it ever did.

Not all of them can match, and the ones that cannot say so themselves: each carries a
`differs` map naming the cases it cannot match and why — ghtml escapes to numeric entities
and escapes `=` as well, lit emits its `<!--lit-part-->` hydration markers, and preact's
escaper leaves `>` and `'` alone. An entry that stops being true fails `verify()` too, so an
exemption cannot outlive the thing it was excusing.

### Attributes from an object

`table.js` has a third table for building attributes from a plain object at render time —
what `attrs()` is for — and only three of the seven are in it.

lit is absent because it cannot do it at all: `@lit-labs/ssr` does not render element parts,
and says so in its own source ("Server-only templates don't support element parts, as their
API does not currently give them any way to render anything on the server"). The one route
that renders, `unsafeStatic`, works by making the attribute string part of the template's
identity, so every distinct attribute set compiles a fresh template and leaks it into lit's
cache — timing that would measure a pathology.

hono and ghtml are absent because neither has an attribute mechanism: an object interpolates
as `[object Object]`, so the only way through is building the string by hand. Their rows
would time our builder and a `raw()` passthrough, not the library — the same reason
`@kitajs/html` is not here at all.

That leaves @itsy/html's `attrs()`, htm's `...${props}` spread, and a hand-written builder in
`baseline.js` as the floor.

### Nothing to escape

The fourth and fifth tables are `trusted`'s, and it is in no other. It writes values as they
are, so on the shared data, whose names hold `&` and `"`, it would only be a second no-escaping
row. It is also not allowed that data: its development build throws code 20 on the first name.

So the clean cases (`CLEAN_CASES` in `spec.js`) render the same templates over `clean` from
`fixtures.js`: the products with nothing to escape, and plain text as long as the escape-heavy
string. `html` and the two reference points run them too. `verify()` holds all four to the same
bytes on every clean case. With nothing to escape, the escaper and no escaper at all must agree,
and that is what proves the data fit for `trusted`.

Each renderer measures its clean cases in a process of their own, apart from its shared cases,
and `trusted` apart from `html`. The clean data is built on first use, so only those processes
hold it, and the shared tables come from processes exactly as they were before this table
existed.

That second part is measured, not tidiness. Allocating the thousand clean products at import, in a
process that never rendered one of them, moved @itsy/html's escape-heavy case from 2.43 µs to
1.92 µs on the same build. A thousand unrelated arrays did not move it, and neither did the clean
text, and the hand-written escaper did not move at all. It is heap layout, not the library, and
it is why a new fixture must not be allocated where it is not used.

The clean cases take their data as arguments, `Card(item)`, the same way in all four renderers.

## The contenders

| renderer                        | what it is                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------- |
| `@itsy/html`                    | this library, production build                                                |
| `@itsy/html trusted`            | this library's `trusted` tag, production build: no escaping; clean cases only |
| `hono/html`                     | tagged template, escapes every value, ships inside Hono                       |
| `ghtml`                         | tagged template, escapes every value, zero dependencies                       |
| `htm + preact-render-to-string` | tagged template parsed to preact vnodes, then rendered                        |
| `lit + @lit-labs/ssr`           | `TemplateResult` built by lit, turned into a string by the ssr package        |
| hand-written                    | a plain template literal with an `esc()` call around each value               |
| no escaping                     | a plain template literal and nothing else                                     |

The last two are reference points rather than libraries. The hand-written one uses the same
escaper as @itsy/html, so it shows what is left once the scanner, the context and the URL
guard are taken away: the floor for a correct renderer, not a typical one. The unescaped one
is the speed of light, and an XSS hole.

`uhtml` was meant to be here too. Version 5 dropped its `/ssr` export and is browser-only, so
there is nothing to compare on the server. `@kitajs/html` is left out for a different reason:
it is JSX and needs a compile step, so it is not the same authoring model.

## Caveats

- One machine, one runtime. Ratios travel between machines; nanoseconds do not.
- The dataset is 1000 products whose names hold `&` and `"`. Text with nothing to escape is
  the fastest path in every renderer, and text that is all `<` and `&` is the slowest; real
  pages sit between them, and the `escape` case shows where that edge is.
- @itsy/html scans each template once and caches the result on the strings array, so the
  first render of a call site costs more than the rest. `pnpm bench:vs` measures that as
  `cold`. The other renderers cache the same way.
- The production build is what runs here. The development build adds the markup audit, which
  also runs once per call site, so it lands on the cold number only.
- Importing `harness.js` installs lit's global DOM shim process-wide, because
  `renderers/lit.js` does it on its first line. Every entry point gets it, `size.js`
  included, whether or not lit is being measured.
