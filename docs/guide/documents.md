# Full documents

`@itsy/html/frame` writes a full HTML frame including:

- doctype
- `<html lang>`
- `head` with no duplicates
- `body` with the order of `header`, `content`, `footer`, `scripts`

```ts
import { frame } from '@itsy/html/frame';

frame({
  lang: 'en', // required, escaped
  title: 'Orders', // required, escaped
  description: 'Open and recent orders', // optional, escaped, right after the title
  head: [
    { tag: 'link', attrs: { rel: 'stylesheet', href: cssUrl } },
    { tag: 'link', attrs: { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' } },
    ...sharedHeadAssets,
  ],
  header: Header(data),
  content: html`<h1>${title}</h1>`, // inside <main id="maincontent" tabindex="-1">
  footer: Footer(data),
  scripts: [{ tag: 'script', attrs: { src: '/app.js', type: 'module' } }],
  nonce, // added to every script and style entry without one
});
```

## Options

| option                        | what it does                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------- |
| `lang`, `dir`                 | `<html lang dir>`. `lang` is required.                                            |
| `title`, `description`        | Written into the head after charset and viewport. Both escaped.                   |
| `head`                        | Entries, in the order given, after those four.                                    |
| `header`, `content`, `footer` | The body, in that order.                                                          |
| `main`                        | `false` writes `content` without the `<main>` wrapper, for a page with its own.   |
| `scripts`                     | Right before `</body>`.                                                           |
| `nonce`                       | Added to every script and style entry that has none of its own.                   |
| `attrs`                       | `{ html, body, main }` — extra attributes on the three elements the frame writes. |

## The head merges

The head starts with charset, viewport, title and description, then the entries in the order
given. If two entries are the same thing — two icons of the same type, two `<meta>` with the
same name — the later one wins and takes the earlier one's position.

That ordering rule is what makes shared layouts work. A page can spread in a shared list of head
assets and override one icon, without the override jumping to the bottom of the head.

::: details What counts as the same entry

- Only one `title`, `base`, `charset`, `canonical` and `manifest`.
- One `meta` per `name`, `property` or `http-equiv`.
- One `link` per `rel` + `href`. One icon per `type` + `sizes`.
- One `script` per `src`. An inline script is always unique.
- Set `key` on an entry to override all of the above.
- Ready-made `Html` is passed through as-is and never deduplicated.

:::

::: details Entry rules
An entry is `{ tag, attrs, body, key }`.

- Attributes go through [`attrs()`](/guide/writing-html#attributes), URL guard included.
- A text body is escaped. A function body is called. A `<script>` or `<style>` body must be `Html`,
  which means `raw()` — the same rule as [inside a template](/api/html#contexts).
- A void element gets no end tag and cannot have a body ([code 18](/reference/errors#e18)).
- A tag name that is not a legal tag name is [code 17](/reference/errors#e17).

:::

::: details The head, in the order a browser wants it
The frame writes the first three. The rest comes from `head`, in the order given, so list it in this
order.

1. `<meta charset>`, first, so the parser never has to restart.
2. `<meta name="viewport">`, before any layout is computed. A `color-scheme` meta belongs here too.
3. `<title>`, then `<meta name="description">`.
4. Render-blocking scripts, and a `no-js` class swap if there is one, before the stylesheets.
5. Stylesheets, with the print stylesheet (`media="print"`) last.
6. Module scripts. `type="module"` defers them, so they cost nothing here.
7. Icons and the manifest.
8. `canonical` and `alternate` links.
9. The rest: Open Graph, `theme-color`, `text-scale`.

```ts
frame({
  lang: 'en',
  title: 'Orders - Example',
  description: 'Open and recent orders',
  head: [
    { tag: 'script', attrs: { src: '/js/blocking.js' } },
    { tag: 'link', attrs: { rel: 'stylesheet', href: '/css/styles.css' } },
    { tag: 'link', attrs: { rel: 'stylesheet', href: '/css/print.css', media: 'print' } },
    { tag: 'script', attrs: { src: '/js/app.js', type: 'module' } },
    { tag: 'link', attrs: { rel: 'icon', href: '/favicon.ico', sizes: 'any' } },
    { tag: 'link', attrs: { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' } },
    { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' } },
    { tag: 'link', attrs: { rel: 'manifest', href: '/site.webmanifest' } },
    { tag: 'link', attrs: { rel: 'canonical', href: 'https://example.com/page' } },
    { tag: 'meta', attrs: { property: 'og:url', content: 'https://example.com/page' } },
    { tag: 'meta', attrs: { property: 'og:image', content: 'https://example.com/sm.jpg' } },
    { tag: 'meta', attrs: { name: 'theme-color', content: '#336699' } },
  ],
});
```

:::

## With an existing `<html>` tag

An Astro layout, or any framework that owns the document, has trouble making use of `frame`.

Eject to using `head` and `elements` directly.

```ts
import { head, element } from '@itsy/html/frame';

head(parts, { nonce }); // the merged head, no <head> wrapper
element({ tag: 'link', attrs: { rel: 'icon', href } }); // one entry
```

::: warning
`frame` and `wrap()` always use the default URL guard. A scheme allowed with
[`createHtml`](/api/create) is still blocked in a frame head entry.
:::
