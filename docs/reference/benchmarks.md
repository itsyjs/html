# Benchmarks

Template in, escaped HTML string out, measured against four other renderers and two reference
points. The suite lives in [`bench/`][bench] and you can run it yourself:

```sh
pnpm bench       # the tables below
pnpm bench:full  # the same measurements, with distributions and histograms
pnpm bench:size  # bytes emitted rather than time
```

## Relative speed

@itsy/html is 1.00 in every column. Higher is faster: 1.33 is a third faster, 0.22 is between
four and five times slower.

| renderer                      | one `<a>` | one element | nested page | 1000 rows | escape-heavy | overall |
| ----------------------------- | --------: | ----------: | ----------: | --------: | -----------: | ------: |
| no escaping                   |     10.00 |        4.22 |        3.65 |      2.50 |       352.05 |   10.63 |
| hand-written                  |      1.62 |        1.54 |        1.30 |      1.43 |         0.90 |    1.33 |
| **@itsy/html**                |      1.00 |        1.00 |        1.00 |      1.00 |         1.00 |    1.00 |
| hono/html                     |      0.80 |        0.81 |        0.79 |      0.85 |         0.81 |    0.81 |
| ghtml                         |      0.79 |        0.91 |        0.76 |      0.81 |         0.66 |    0.78 |
| htm + preact-render-to-string |      0.31 |        0.27 |        0.34 |      0.26 |         1.28 |    0.40 |
| lit + @lit-labs/ssr           |      0.19 |        0.20 |        0.20 |      0.18 |         0.38 |    0.22 |

## Time per render

One unit per column, so a column can be read straight down. Lower is faster.

| renderer                      | one `<a>` | one element | nested page | 1000 rows | escape-heavy |
| ----------------------------- | --------: | ----------: | ----------: | --------: | -----------: |
| no escaping                   |   24.4 ns |     88.5 ns |     1.76 µs |    195 µs |      0.01 µs |
| hand-written                  |    151 ns |      243 ns |     4.93 µs |    340 µs |      4.27 µs |
| **@itsy/html**                |    244 ns |      374 ns |     6.42 µs |    487 µs |      3.84 µs |
| hono/html                     |    304 ns |      461 ns |     8.18 µs |    574 µs |      4.75 µs |
| ghtml                         |    309 ns |      412 ns |     8.42 µs |    599 µs |      5.79 µs |
| htm + preact-render-to-string |    792 ns |     1371 ns |     18.8 µs |   1839 µs |      3.01 µs |
| lit + @lit-labs/ssr           |   1273 ns |     1872 ns |     32.5 µs |   2665 µs |      10.2 µs |

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

- One machine, one runtime: Apple M5, Node 26.9.0, measured 20 September 2026 against lit 3.3.3,
  @lit-labs/ssr 4.1.0, hono 4.13.8, ghtml 4.0.2 and preact-render-to-string 6.7.0. Ratios travel
  between machines; nanoseconds do not.
- The production build is what runs here. The development build adds the
  [markup check](/guide/checks), which runs once per call site, not once per render.
- Every renderer caches its analysis of a template on the strings array, so the first render of a
  call site costs more than the rest. For @itsy/html that is about 1.9 µs against 244 ns.
  `pnpm bench:full` measures both.
- uhtml was meant to be here. Version 5 dropped its `/ssr` export and is browser-only, so there
  is nothing to compare on a server. @kitajs/html is left out because it is JSX and needs a
  compile step, which is a different authoring model.

[bench]: https://github.com/itsyjs/html/tree/main/bench
