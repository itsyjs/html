# Benchmarks

These benchmarks are not intended to say one library is better than another, only to provide some rough idea of performance as a reference.

To reproduce these tables:

```sh
pnpm bench            # the tables below
pnpm bench:vs [rev]   # this working tree against another revision, to check a change
pnpm bench:size       # bytes emitted rather than time
```

<small>All benchmark data below was produced on a base-model M5 Macbook Air</small>

## Relative speed

@itsy/html is 1.00 in every column. Higher is faster, meaning 1.33 is a third faster and 0.25 is four times slower.

| renderer                      | one `<a>` | one element | nested page | 1000 rows | escape-heavy | overall |
| ----------------------------- | --------: | ----------: | ----------: | --------: | -----------: | ------: |
| no escaping                   |      9.34 |        3.94 |        2.54 |      1.95 |       428.87 |    9.51 |
| hand-written                  |      1.43 |        1.42 |        1.00 |      1.17 |         1.09 |    1.21 |
| **@itsy/html**                |      1.00 |        1.00 |        1.00 |      1.00 |         1.00 |    1.00 |
| hono/html                     |      0.74 |        0.76 |        0.58 |      0.69 |         0.81 |    0.71 |
| ghtml                         |      0.72 |        0.78 |        0.57 |      0.67 |         0.83 |    0.71 |
| htm + preact-render-to-string |      0.34 |        0.28 |        0.28 |      0.25 |         1.23 |    0.39 |
| lit + @lit-labs/ssr           |      0.17 |        0.18 |        0.15 |      0.17 |         0.46 |    0.20 |

## Absolute time per render

Lower is faster.

| renderer                      | one `<a>` | one element | nested page | 1000 rows | escape-heavy |
| ----------------------------- | --------: | ----------: | ----------: | --------: | -----------: |
| no escaping                   |   12.1 ns |     44.3 ns |     0.96 µs |    102 µs |      0.01 µs |
| hand-written                  |   78.5 ns |      123 ns |     2.45 µs |    168 µs |      2.15 µs |
| **@itsy/html**                |    113 ns |      174 ns |     2.45 µs |    198 µs |      2.35 µs |
| hono/html                     |    153 ns |      230 ns |     4.22 µs |    286 µs |      2.92 µs |
| ghtml                         |    156 ns |      224 ns |     4.28 µs |    296 µs |      2.83 µs |
| htm + preact-render-to-string |    330 ns |      613 ns |     8.66 µs |    780 µs |      1.92 µs |
| lit + @lit-labs/ssr           |    657 ns |      953 ns |     16.3 µs |   1195 µs |      5.09 µs |

## html vs trusted performance

[`trusted`](/api/html#trusted) is a more performant export that removes escaping

| renderer                 | one `<a>` | one element | nested page | 1000 rows | plain text | overall |
| ------------------------ | --------: | ----------: | ----------: | --------: | ---------: | ------: |
| no escaping              |      5.91 |        2.77 |        1.91 |      1.55 |       8.98 |    3.37 |
| **@itsy/html `trusted`** |      2.12 |        1.62 |        1.71 |      1.48 |       2.53 |    1.86 |
| hand-written             |      2.26 |        2.00 |        1.30 |      1.34 |       1.72 |    1.69 |
| **@itsy/html**           |      1.00 |        1.00 |        1.00 |      1.00 |       1.00 |    1.00 |

| renderer                 | one `<a>` | one element | nested page | 1000 rows | plain text |
| ------------------------ | --------: | ----------: | ----------: | --------: | ---------: |
| no escaping              |   12.4 ns |     44.8 ns |     0.90 µs |   96.5 µs |    6.06 ns |
| **@itsy/html `trusted`** |   34.7 ns |     76.6 ns |     1.00 µs |    101 µs |    21.5 ns |
| hand-written             |   32.5 ns |     61.9 ns |     1.31 µs |    112 µs |    31.7 ns |
| **@itsy/html**           |   73.5 ns |      124 ns |     1.71 µs |    150 µs |    54.4 ns |

## Benchmark test descriptions

Rendered from a list of 1000 products whose names hold `&` and `"`, and whose links hold `&` — ordinary data that still has to be escaped.

| column       | what it renders                                                    |
| ------------ | ------------------------------------------------------------------ |
| one `<a>`    | a single link: one URL attribute, one class, one text value        |
| one element  | one `<article>` with five values in it, no URL attribute           |
| nested page  | a nav and a list, built from templates nested three deep           |
| 1000 rows    | a table, 1000 rows of four cells, each row nesting a link template |
| escape-heavy | 760 characters of nothing but `<`, `>`, `&`, `"` and `'`           |

The escape-heavy column is the worst case for an escaper, not a realistic page. Text with nothing
to escape should be the fastest path for every renderer.

## The two reference points

**hand-written** is a plain template literal with an `esc()` call around each value, using the same
escaper @itsy/html uses. It has no scanner, no context, no URL guard and allocates no `Html`, so it
is the 'speed floor' and not a typical performance example.

**no escaping** is the same template literal with the `esc()` calls taken out. It is meant to be a reference for the absolute fastest the test machine is performing at.
