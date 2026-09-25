# What it does not do

The guarantee is narrow and worth stating exactly: **values interpolated into a template are
escaped for the context they land in, and URLs are scheme-checked.** Everything below is outside
that line.

## It escapes values, it does not clean markup

This is not a sanitizer. Given a string of HTML from a user, it has nothing to offer: escaping it
shows the tags as text, and `raw()` publishes whatever it contained. There is no third option here.

To accept markup from people — comment bodies, a rich-text field, anything pasted — run
it through a sanitizer first and `raw()` the result.

```ts
import DOMPurify from 'dompurify';

html`<div class="comment">${raw(DOMPurify.sanitize(userMarkup))}</div>`;
```

Rendering user text, rather than user markup, needs none of this. `${userText}` is already safe.

## A tag name in `raw()`

`<${raw(name)}>` is taken on trust, like any `raw()`: the scanner cannot see which element it
opens, so it reads what follows as ordinary markup. If the name is `script` or `style`, a value
after it is escaped as text, and escaped text in a script still runs. Pick dynamic tag names from a
fixed list, as in ``raw(`h${level}`)`` with a checked `level`, never from input.

## `trusted` writes values as they are {#trusted}

[`trusted`](/api/html#trusted) gives up escaping for speed. In production, anything a value holds
reaches the page as it is, and its output nests into `html` without being escaped again. The
development build throws [code 20](/reference/errors#e20) for any value that needs escaping, but it
only sees the data that runs through it in development. A field that later starts taking user input
is not caught.

To keep it out of a codebase, ban the import. ESLint's `no-restricted-imports` does it, and so does
oxlint's:

```json
{
  "no-restricted-imports": [
    "error",
    { "paths": [{ "name": "@itsy/html", "importNames": ["trusted"], "message": "Use html." }] }
  ]
}
```

## Data in a script block

`JSON.stringify` does not escape `<`, and a `</script>` inside the data ends the block early
however the JSON is quoted. This is the one escape the library cannot do, because the
contents of a script are `raw()` by definition.

```ts
const data = raw(JSON.stringify(state).replace(/</g, '\\u003c'));
html`<script type="application/json" id="data">${data}</script>`;
```

Or use a serializer that already handles it, such as devalue or serialize-javascript.

## Content Security Policy

The library writes no inline event handlers — `on*` is refused outright — so a policy without
`unsafe-inline` for scripts is compatible as written.

For the inline scripts and styles a page does add, `frame({ nonce })` puts the nonce on every script
and style entry that does not have one. Generate it per request.

```ts
const nonce = crypto.randomUUID();
frame({ lang: 'en', title, scripts, nonce });
```

Ready-made `Html` passed into `head` or `scripts` is left alone, nonce included. An element built
by hand needs its nonce added by hand.

## It is not an HTML validator

The [markup check](/guide/checks) catches what a browser would silently repair — unclosed tags,
stray end tags, nesting the parser rewrites — and the [accessibility
rules](/api/check#accessibility) in `check()` report common failures such as an `<img>` with no
`alt` or a field with no label. Neither knows the content model, so a `<div>` inside a `<span>`
passes, and neither follows the heading outline, so levels that skip a rank pass too. Use
html-validate for the content model, and a full accessibility audit such as axe-core for what the
rules leave out.

## No async

A `Promise` in a template throws [code 7](/reference/errors#e7). Await data before building
the markup. The renderer being synchronous end to end is what lets the same function run in a
browser with no build step.
