# The URL guard

Escaping cannot make `javascript:alert(1)` safe, because there is nothing in it to escape. So URL
attributes get a second check: the scheme has to be one of a short list, or the value is replaced.

```ts run
html`
  <a href="${'/docs'}">relative: always passes</a>
  <a href="${'https://x.y'}">an allowed scheme: passes</a>
  <a href="${'javascript:alert(1)'}">anything else: replaced</a>`;
```

The attributes checked are `href`, `src`, `action`, `formaction`, `data` and `xlink:href`. `srcset` is
escaped but not checked: an image URL cannot run script.

The allowed schemes are `http`, `https`, `mailto`, `tel`, `data` and `blob`. A URL with no scheme —
any relative URL — always passes. Anything else renders as `about:blank#blocked`.

## It never throws

A blocked URL is bad data, not a mistake in your markup, and data must not be able to crash a page
render. So the guard substitutes rather than throwing. To find out whether it fired, run
[`check()`](/guide/checks#check) over the rendered page: every blocked
URL is reported as [code 19](/reference/errors#e19).

## It reads a URL the way a browser does

Browsers ignore whitespace and control characters while reading a scheme, so a check on the raw
string is not enough. The guard strips those and lowercases before looking for a scheme. An `Html`
from `raw()` is checked the same way.

```ts run
html`
  <a href="${'  JaVa\tScRiPt:alert(1)'}">…</a>
  <a href="${'&#106;avascript:alert(1)'}">…</a>
  <a href="${raw('javascript:x')}">…</a>`;
```

The entity case is worth following. `&#106;avascript:` does not start with a letter, so it has no
scheme as far as the guard is concerned and passes through — as `&amp;#106;avascript:`. The browser
then reads that as the literal characters `&#106;avascript:`, which is not a scheme it knows. It is
inert either way.

## Adding a scheme

`createHtml` gives you an `html` and `attrs` with their own scheme list. Call it once, at module scope.

```ts
import { createHtml, SCHEMES } from '@itsy/html/create';

export const { html, attrs } = createHtml({ schemes: [...SCHEMES, 'sms'] });
```

`schemes` replaces the set rather than extending it, so spread `SCHEMES` to keep the defaults —
`createHtml({ schemes: ['https'] })` allows https and nothing else, which is sometimes what you
want.

For one link, widening the guard for a whole page is the wrong size of tool. Write the tag:

```ts
html`<p>${raw('<a href="sms:+4712345678">Text us</a>')}</p>`;
```

::: warning
`frame` and `wrap()` always use the default set. A scheme you allowed through `createHtml` is
still blocked in a frame head entry or a `wrap()` attribute.
:::

## Two things it does not cover

::: details `data:` is allowed, and `data:text/html` is a real document
`data:` is on the list so inline images work. But a `data:text/html` URL in an `<iframe>`,
`<object>` or `<embed>` renders whatever it carries, in its own origin. If such a URL can come from
a user, check its MIME type yourself, or use `createHtml({ schemes: [...] })` with `data`
left out.
:::

::: details `srcset` is escaped but not checked
Its URLs are not scheme-checked. An image URL cannot run script, and parsing the comma-and-
descriptor format correctly is not worth what it would cost every user of the library.
:::
