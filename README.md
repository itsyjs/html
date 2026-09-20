# @itsy/html

Tagged-template HTML renderer, zero dependencies, just enough features.

**[Documentation][docs]** · [Playground][playground] · [Error codes][errors]

```sh
pnpm add @itsy/html
```

```ts
import { html, attrs } from '@itsy/html';

const Link = ({ href, label, active }: LinkData) =>
  html`<a href="${href}" class="link ${active && 'is-active'}">${label}</a>`;

const Menu = ({ groups }: MenuData) => html`
  <nav ${attrs({ 'aria-label': 'Main', hidden: groups.length === 0 })}>
    ${groups.map(
      (g) => html`
        <h2>${g.title}</h2>
        <ul>${g.links.map((l) => html`<li>${Link(l)}</li>`)}</ul>`,
    )}
  </nav>`;

res.send(String(Menu(data))); // server
el.innerHTML = Menu(data); // client: same function, same string, no hydration
```

## Why

Most template renderers escape every value the same way, wherever it lands, and none of them look
at URLs. One escape cannot be right everywhere: text needs entities, an unquoted attribute needs
quotes before anything else helps, and `javascript:` in an `href` contains nothing worth escaping
and still runs.

This one reads the static markup around each value, works out which context the value landed in,
and applies what that context needs. Where no escaping would make a context safe — inside a tag,
inside `<script>`, in any `on*` attribute — it throws instead of guessing. The result is a `String`
subclass, so a template nested in another is not escaped twice, and the same function renders on a
server and in a browser.

## What you get

- **[Escaping by context][contexts]** — text, a quoted attribute, a URL, the inside of a tag, a
  script body and a comment are six different jobs, and the renderer picks per value.
- **[A URL scheme guard][url-guard]** — anything outside `http https mailto tel data blob` renders
  as `about:blank#blocked`, however it is spelled.
- **[A markup check in development][mistakes]** — unclosed tags, stray end tags and nesting a
  browser would rewrite, reported the first time a template runs.
- **[`attrs()` and `cx()`][attributes]** — booleans, class lists, style objects, `aria` and `data`
  groups, with the URL guard applied to attributes that hold URLs.
- **[`frame()`][frame]** — a whole document, with a head that merges so a page can override one
  entry of a shared layout without reordering the rest.
- **[`check()`][check]** — the same checks over a rendered page, plus duplicate ids, id references
  pointing nowhere, and any URL the guard blocked. 17 bytes in production.
- **[`a11y`][a11y]** — nineteen accessibility rules for `check()`, in the same pass and the same
  list: the unlabelled icon button, the misspelled `aria-` attribute, the image with no `alt`.
  `without()` turns any of them off, with the names type-checked. 29 bytes in production.

## Before you start

> [!WARNING]
> `Html` is an object, not a primitive. `typeof` reports `'object'`, an empty one is truthy, and
> any framework that serializes objects will JSON-encode it rather than send your markup. Call
> `String(view)` at that boundary.

> [!WARNING]
> Prettier and oxfmt reformat the HTML inside `html` templates by default. `<br>` becomes `<br />`,
> which the markup check then reports. Set `"embeddedLanguageFormatting": "off"`.

## Size

Minified and brotli-compressed, with the listed imports and nothing else.

| import              |                            | production  | development |
| ------------------- | -------------------------- | ----------- | ----------- |
| `@itsy/html`        | `html`, `attrs`, `raw`     | **1.61 kB** | 3.92 kB     |
| `@itsy/html/attrs`  | `attrs`, `cx`              | **797 B**   | —           |
| `@itsy/html/check`  | `check`                    | **17 B**    | 2.26 kB     |
| `@itsy/html/a11y`   | `a11y`, `without`          | **29 B**    | 2.15 kB     |
| `@itsy/html/frame`  | `frame`, `head`, `element` | **2.43 kB** | 4.72 kB     |
| `@itsy/html/util`   | all seven helpers          | **1.05 kB** | —           |
| `@itsy/html/create` | `createHtml`               | **1.66 kB** | —           |

[The import map][imports] has every entry point and what each one exports.

## For coding agents

[AGENTS.md](./AGENTS.md) is a task-oriented map of the library, and it ships inside the package.
The site also publishes [`llms.txt`][llms] and [`llms-full.txt`][llms-full].

## License

MIT

<!-- Every docs link. Change the base here if the site moves. -->

[docs]: https://itsyjs.github.io/html/
[playground]: https://itsyjs.github.io/html/playground
[contexts]: https://itsyjs.github.io/html/api/html#contexts
[attributes]: https://itsyjs.github.io/html/guide/writing-html#attributes
[mistakes]: https://itsyjs.github.io/html/guide/checks
[frame]: https://itsyjs.github.io/html/guide/documents
[url-guard]: https://itsyjs.github.io/html/security/url-guard
[check]: https://itsyjs.github.io/html/api/check
[a11y]: https://itsyjs.github.io/html/api/a11y
[errors]: https://itsyjs.github.io/html/reference/errors
[imports]: https://itsyjs.github.io/html/reference/imports
[llms]: https://itsyjs.github.io/html/llms.txt
[llms-full]: https://itsyjs.github.io/html/llms-full.txt
