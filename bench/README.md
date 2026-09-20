# bench

Not part of the package, and not installed with it. Its own `package.json` so the
root install stays small, and its own `node_modules`, because it pulls in five
other renderers.

```sh
pnpm bench       # from the repo root: the comparison table
pnpm bench:full  # mitata's own output, with distributions and histograms
pnpm bench:size  # output bytes instead of time
```

All three root scripts run `tsdown` first, so the numbers always come from the current
source rather than whatever was in `dist` last. To run a single file from here:

```sh
pnpm install --ignore-workspace
node table.js   # two tables: relative speed, then time per render
node server.js  # the same measurements, mitata's full output
node escape.js  # the escaper on its own
node size.js    # bytes emitted
```

`harness.js` holds the contenders, the fairness guard and the timer that both
`table.js` and `server.js` use. Read the comment at the top of it before changing
how anything is timed: the numbers used to depend on `verify()` happening to warm
the V8 heap, and whichever renderer went first without that read two to three times
slow. It now warms and calibrates everything before recording anything, reports the
median of twenty batches, and warns on stderr when a run was too noisy to publish.

`table.js` exists because mitata picks a unit per row, which is right when you read
one row and useless when you read down a column: 947 µs against 2.66 ms against 190 µs
is three conversions before you know who won. It gives each column one unit, and the
first of its two tables drops units entirely and shows the ratio to @itsy/html.

The `--ignore-workspace` is needed because the repo root has a
`pnpm-workspace.yaml` that does not list this directory, and pnpm would otherwise
decide there is nothing to install.

## What is measured

Template in, escaped HTML string out — the whole job, inside the timed function.

That last part is the reason lit appears here as `lit + @lit-labs/ssr` rather than
as `lit`. Lit's `html` renders nothing; it returns a `TemplateResult` holding the
strings and the values, and the work happens later, in `lit-html`'s `render()`
against the DOM or in `@lit-labs/ssr`'s against a string. Timing `html` against
`html` would compare an object allocation to a full escape-and-concatenate, and
@itsy/html would win a race the other library never entered.

`size.js` prints the bytes each renderer emits. Four of the seven agree to the
byte on four of the five cases, which is the best evidence available that they
are being asked for the same thing.

Every renderer is one small file under `renderers/`, holding the same five
templates, so the comparison can be checked by reading them side by side. Before
anything is timed, `server.js` asserts that each one rendered all 1000 rows and
left no `<script>` unescaped.

## The contenders

| renderer                       | what it is                                                       |
| ------------------------------ | ---------------------------------------------------------------- |
| `@itsy/html`                   | this library, production build                                    |
| `hono/html`                    | tagged template, escapes every value, ships inside Hono           |
| `ghtml`                        | tagged template, escapes every value, zero dependencies           |
| `htm + preact-render-to-string`| tagged template parsed to preact vnodes, then rendered            |
| `lit + @lit-labs/ssr`          | `TemplateResult` built by lit, turned into a string by the ssr package |
| hand-written                   | a plain template literal with an `esc()` call around each value   |
| no escaping                    | a plain template literal and nothing else                         |

The last two are reference points rather than libraries. The hand-written one uses
the same escaper as @itsy/html, so it shows what is left once the scanner, the
context and the URL guard are taken away: it is the floor for a correct renderer,
not a typical one. Most hand-rolled escapers are a `replace` with a callback, which
is roughly half the speed. The unescaped one is the speed of light, and a hole in
your site.

`uhtml` was meant to be here too. Version 5 dropped its `/ssr` export and is now
browser-only, so there is nothing to compare on the server. `@kitajs/html` is
left out for a different reason: it is JSX and needs a compile step, so it is not
the same authoring model.

## Caveats

- One machine, one runtime. Ratios travel between machines; nanoseconds do not.
- The dataset is 1000 products whose names hold `&` and `"`. Text with nothing to
  escape is the fastest path in every renderer, and text that is all `<` and `&`
  is the slowest; real pages sit between them, and the `escape` case is there to
  show where that edge is.
- @itsy/html scans each template once and caches the result on the strings array,
  so the first render of a call site costs more than the rest. `server.js`
  measures both. The other renderers cache the same way.
- The production build is what runs here. The development build adds the markup
  audit, which also runs once per call site, so it lands on the cold number only.
