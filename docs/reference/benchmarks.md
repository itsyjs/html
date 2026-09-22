# Benchmarks

Template in, escaped HTML string out, measured against four other renderers and two reference
points. The suite lives in [`bench/`][bench] and you can run it yourself:

```sh
pnpm bench            # the tables below
pnpm bench:vs [rev]   # this working tree against another revision, to check a change
pnpm bench:size       # bytes emitted rather than time
```

Every renderer is measured in **its own process**, warmed only by itself — which is how it
runs in production, one templating library per server.

That detail is not cosmetic. A process holding all seven does not measure any of them
honestly, and the older figures on this page were wrong in both directions because of it: they
flattered @itsy/html, and they penalised everything else by up to 2.8x. A library's presence
can change its neighbours — see [the note on `Html`](/api/html#html-class) for the case that
cost every other renderer in the process nearly 3x until it was fixed.

## Relative speed

@itsy/html is 1.00 in every column. Higher is faster: 1.33 is a third faster, 0.22 is between
four and five times slower.

| renderer                      | one `<a>` | one element | nested page | 1000 rows | escape-heavy | overall |
| ----------------------------- | --------: | ----------: | ----------: | --------: | -----------: | ------: |
| no escaping                   |      8.77 |        4.18 |        2.41 |      2.04 |       410.62 |    9.41 |
| hand-written                  |      1.41 |        1.42 |        0.97 |      1.19 |         1.11 |    1.21 |
| **@itsy/html**                |      1.00 |        1.00 |        1.00 |      1.00 |         1.00 |    1.00 |
| hono/html                     |      0.72 |        0.81 |        0.58 |      0.73 |         0.85 |    0.73 |
| ghtml                         |      0.73 |        0.91 |        0.53 |      0.70 |         0.83 |    0.73 |
| htm + preact-render-to-string |      0.34 |        0.32 |        0.28 |      0.26 |         1.37 |    0.41 |
| lit + @lit-labs/ssr           |      0.16 |        0.20 |        0.15 |      0.17 |         0.46 |    0.21 |

## Time per render

One unit per column, so a column can be read straight down. Lower is faster.

| renderer                      | one `<a>` | one element | nested page | 1000 rows | escape-heavy |
| ----------------------------- | --------: | ----------: | ----------: | --------: | -----------: |
| no escaping                   |   13.0 ns |     45.7 ns |     1.01 µs |    102 µs |      0.01 µs |
| hand-written                  |   80.4 ns |      135 ns |     2.50 µs |    175 µs |      2.21 µs |
| **@itsy/html**                |    114 ns |      191 ns |     2.43 µs |    208 µs |      2.45 µs |
| hono/html                     |    158 ns |      236 ns |     4.23 µs |    287 µs |      2.89 µs |
| ghtml                         |    156 ns |      210 ns |     4.59 µs |    297 µs |      2.95 µs |
| htm + preact-render-to-string |    332 ns |      590 ns |     8.73 µs |    803 µs |      1.79 µs |
| lit + @lit-labs/ssr           |    700 ns |      964 ns |     16.6 µs |   1248 µs |      5.29 µs |

## Attributes from an object

Ten links whose attribute names come from an object at render time rather than from the
template — what [`attrs()`](/api/attrs) is for. Only three of the seven can do this: lit's SSR
package cannot render an element part at all, and neither hono nor ghtml has an attribute
mechanism, so their rows would time a string builder written here rather than the library.

| renderer                      | ten links | vs hand-written |
| ----------------------------- | --------: | --------------: |
| **@itsy/html**                |   2.99 µs |            1.04 |
| hand-written                  |   3.11 µs |            1.00 |
| htm + preact-render-to-string |   6.16 µs |            0.51 |

## What the columns are

Rendered from a list of 1000 products whose names hold `&` and `"`, and whose links hold `&` —
ordinary data that still has to be escaped.

| column       | what it renders                                                    |
| ------------ | ------------------------------------------------------------------ |
| one `<a>`    | a single link: one URL attribute, one class, one text value        |
| one element  | one `<article>` with five values in it, no URL attribute           |
| nested page  | a nav and a list, built from templates nested three deep           |
| 1000 rows    | a table, 1000 rows of four cells, each row nesting a link template |
| escape-heavy | 760 characters of nothing but `<`, `>`, `&`, `"` and `'`           |

The escape-heavy column is the worst case for an escaper, not a realistic page. Text with nothing
to escape is the fastest path in every renderer here, and real pages sit between the two.

## The two reference points

**hand-written** is a plain template literal with an `esc()` call around each value, using the same
escaper @itsy/html uses. It has no scanner, no context, no URL guard and allocates no `Html`, so it
is the floor for a correct renderer rather than a typical one. Most hand-rolled escapers are a
`replace` with a callback, which is roughly half the speed.

**no escaping** is the same template literal with the `esc()` calls taken out. It is the speed of
light, and a hole in your site.

## Why lit appears with @lit-labs/ssr

Lit's `html` renders nothing. It returns a `TemplateResult` holding the strings and the values, and
the work happens later — in lit-html's `render()` against the DOM, or in @lit-labs/ssr's against
a string. Timing `html` against `html` would compare an object allocation to a full
escape-and-concatenate, and @itsy/html would win a race the other library never entered. Every row
here does the whole job inside the timed function, including the step that produces the string.

The client side is a different question, and this suite does not answer it. @itsy/html sets
`innerHTML` once and Lit diffs the DOM, so Lit does the repeated update far better. That is a
non-goal here, not a result.

## Output bytes

Speed is not the only cost of a server renderer. This is the same markup, as each one emits it:

| renderer                      | one `<a>` | one element | nested page | 1000 rows |
| ----------------------------- | --------: | ----------: | ----------: | --------: |
| **@itsy/html**                |        97 |         143 |       2,073 |   147,192 |
| hono/html                     |        97 |         143 |       2,073 |   147,192 |
| htm + preact-render-to-string |        97 |         143 |       2,073 |   147,192 |
| hand-written                  |        97 |         143 |       2,073 |   147,192 |
| ghtml                         |       103 |         139 |       2,193 |   153,192 |
| lit + @lit-labs/ssr           |       189 |         266 |       5,111 |   376,267 |

Four of the six agree to the byte, which is the best evidence available that they are being asked
for the same thing. ghtml differs because it escapes `=` as well. Lit's extra 2.5x is hydration
markers — `<!--lit-part-->` and `<!--lit-node-->` — which travel on every request.

## Caveats

- Each figure is the median of twenty batches, taken after every renderer has been run enough to
  grow the V8 heap. Skipping that warmup makes whichever renderer is measured first read two to
  three times slow, so the harness does it explicitly and warns if a run was too noisy to trust.
- Repeated runs on the same machine hold the ratios to about ±0.02 and the times to about ±5%.
  Read the first table for the comparison and the second for the order of magnitude.
- One machine, one runtime: Apple M5, Node 26.9.0, measured 20 September 2026 against lit 3.3.3,
  @lit-labs/ssr 4.1.0, hono 4.13.8, ghtml 4.0.2 and preact-render-to-string 6.7.0. Ratios travel
  between machines; nanoseconds do not.
- The production build is what runs here. The development build adds the
  [markup check](/guide/checks), which runs once per call site, not once per render.
- Every renderer caches its analysis of a template on the strings array, so the first render of a
  call site costs more than the rest. For @itsy/html that is about 760 ns against 121 ns.
  `pnpm bench:vs` measures it as `cold`.
- uhtml was meant to be here. Version 5 dropped its `/ssr` export and is browser-only, so there
  is nothing to compare on a server. @kitajs/html is left out because it is JSX and needs a
  compile step, which is a different authoring model.

[bench]: https://github.com/itsyjs/html/tree/main/bench
