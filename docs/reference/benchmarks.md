# Benchmarks

Template in, escaped HTML string out, measured against four other renderers and two reference
points. The suite lives in [`bench/`][bench] and runs locally:

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
| no escaping                   |      8.66 |        3.74 |        2.53 |      1.97 |       406.13 |    9.19 |
| hand-written                  |      1.41 |        1.41 |        0.96 |      1.19 |         1.12 |    1.21 |
| **@itsy/html**                |      1.00 |        1.00 |        1.00 |      1.00 |         1.00 |    1.00 |
| ghtml                         |      0.73 |        0.82 |        0.59 |      0.69 |         0.86 |    0.73 |
| hono/html                     |      0.71 |        0.76 |        0.58 |      0.70 |         0.88 |    0.72 |
| htm + preact-render-to-string |      0.33 |        0.30 |        0.29 |      0.25 |         1.27 |    0.39 |
| lit + @lit-labs/ssr           |      0.16 |        0.18 |        0.15 |      0.17 |         0.49 |    0.20 |

## Time per render

One unit per column, so a column can be read straight down. Lower is faster.

| renderer                      | one `<a>` | one element | nested page | 1000 rows | escape-heavy |
| ----------------------------- | --------: | ----------: | ----------: | --------: | -----------: |
| no escaping                   |   12.8 ns |     47.1 ns |     0.98 µs |    102 µs |      0.01 µs |
| hand-written                  |   78.6 ns |      125 ns |     2.57 µs |    169 µs |      2.19 µs |
| **@itsy/html**                |    111 ns |      176 ns |     2.48 µs |    201 µs |      2.45 µs |
| ghtml                         |    152 ns |      215 ns |     4.24 µs |    291 µs |      2.86 µs |
| hono/html                     |    157 ns |      233 ns |     4.24 µs |    289 µs |      2.80 µs |
| htm + preact-render-to-string |    336 ns |      591 ns |     8.68 µs |    792 µs |      1.93 µs |
| lit + @lit-labs/ssr           |    681 ns |      993 ns |     16.3 µs |   1207 µs |      5.04 µs |

## Attributes from an object

Ten links whose attribute names come from an object at render time rather than from the
template — what [`attrs()`](/api/attrs) is for. Only three of the seven can do this: lit's SSR
package cannot render an element part at all, and neither hono nor ghtml has an attribute
mechanism, so their rows would time a string builder written here rather than the library.

| renderer                      | ten links | vs hand-written |
| ----------------------------- | --------: | --------------: |
| **@itsy/html**                |   2.90 µs |            1.05 |
| hand-written                  |   3.03 µs |            1.00 |
| htm + preact-render-to-string |   6.20 µs |            0.49 |

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
light, and an XSS hole.

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

- Each figure is mitata's median sample, taken over at least 250 ms of CPU time per case and
  after twelve passes over every case in that process, so no recorded timing is the one that
  grows the V8 heap. Skipping that warmup makes whichever renderer is measured first read two to
  three times slow, so the bench does it explicitly.
- Repeated runs on the same machine hold the times to about ±5% and most ratios to ±0.02. The two
  rows closest to @itsy/html move more than that — hand-written, and preact's escape-heavy column,
  both around ±0.06 across three runs. Read the first table for the comparison and the second for
  the order of magnitude.
- One machine, one runtime: Apple M5, Node 26.9.0, measured 22 September 2026 against lit 3.3.3,
  @lit-labs/ssr 4.1.0, hono 4.13.8, ghtml 4.0.2 and preact-render-to-string 6.7.0. Ratios travel
  between machines; nanoseconds do not.
- The production build is what runs here. The development build adds the
  [markup check](/guide/checks), which runs once per call site, not once per render.
- Every renderer caches its analysis of a template on the strings array, so the first render of a
  call site costs more than the rest. For @itsy/html that is about 785 ns against 129 ns.
  `pnpm bench:vs` reports it as `first render of a call site`.
- uhtml was meant to be here. Version 5 dropped its `/ssr` export and is browser-only, so there
  is nothing to compare on a server. @kitajs/html is left out because it is JSX and needs a
  compile step, which is a different authoring model.

[bench]: https://github.com/itsyjs/html/tree/main/bench
