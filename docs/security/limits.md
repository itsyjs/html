# What it does not do

The guarantee is narrow and worth stating exactly: **values interpolated into a template are
escaped for the context they land in, and URLs are scheme-checked.** Everything below is outside
that line.

## It escapes values, it does not clean markup

This is not a sanitizer. Given a string of HTML from a user, it has nothing to offer: escape it and
you get visible tags, `raw()` it and you have published whatever it contained. There is no third
option here.

If you need to accept markup from people — comment bodies, a rich-text field, anything pasted — run
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

## Data in a script block

`JSON.stringify` does not escape `<`, and a `</script>` inside your data ends the block early
however the JSON is quoted. This is the one escape the library cannot do for you, because the
contents of a script are `raw()` by definition.

```ts
const data = raw(JSON.stringify(state).replace(/</g, '\\u003c'));
html`<script type="application/json" id="data">${data}</script>`;
```

Or use a serializer that already handles it, such as devalue or serialize-javascript.

## Content Security Policy

The library writes no inline event handlers — `on*` is refused outright — so a policy without
`unsafe-inline` for scripts is compatible as written.

For inline scripts and styles you do add, `frame({ nonce })` puts the nonce on every script and
style entry that does not have one. Generate it per request.

```ts
const nonce = crypto.randomUUID();
frame({ lang: 'en', title, scripts, nonce });
```

Ready-made `Html` passed into `head` or `scripts` is left alone, nonce included. If you build the
element yourself, put the nonce on it yourself.

## It is not an HTML validator

The [markup check](/guide/checks) catches what a browser would silently repair —
unclosed tags, stray end tags, nesting the parser rewrites. It does not know the content model. It
will not tell you a `<div>` does not belong in a `<span>`, that an `<img>` needs `alt`, or that
your heading levels skip a rank. Use html-validate or an accessibility linter for those.

## No async

A `Promise` in a template throws [code 7](/reference/errors#e7). Await your data before you build
the markup. The renderer being synchronous end to end is what lets the same function run in a
browser with no build step.
