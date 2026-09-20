# @itsy/html/frame

```ts
import { frame, head, element } from '@itsy/html/frame';
import type { FrameOptions, HeadEntry, FramePart } from '@itsy/html/frame';
```

## frame

```ts
frame(options: FrameOptions): Html
```

Writes a full HTML frame

| option        | type                               | notes                                                                                                        |
| ------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `lang`        | `string`                           | Required. `<html lang>`. Escaped.                                                                            |
| `title`       | `string`                           | Required. Escaped.                                                                                           |
| `description` | `string`                           | Escaped, placed right after the title. A head entry with the same name replaces it.                          |
| `dir`         | `'ltr' \| 'rtl' \| 'auto'`         | `<html dir>`.                                                                                                |
| `head`        | `FramePart \| Iterable<FramePart>` | After charset, viewport, title and description.                                                              |
| `header`      | `Renderable`                       | Right after `<body>`.                                                                                        |
| `content`     | `Renderable`                       | Inside `<main id="maincontent" tabindex="-1">`.                                                              |
| `main`        | `boolean`                          | `false` writes `content` with no `<main>` wrapper. Default `true`.                                           |
| `footer`      | `Renderable`                       | After `<main>`, before the scripts.                                                                          |
| `scripts`     | `FramePart \| Iterable<FramePart>` | Right before `</body>`.                                                                                      |
| `nonce`       | `string`                           | Added to every script and style entry that has none.                                                         |
| `attrs`       | `{ html?, body?, main? }`          | Extra attributes on the three elements the frame writes. `main` merges over the default `id` and `tabindex`. |

## head

```ts
head(parts: FramePart | Iterable<FramePart>, options?: { nonce?: string }): Html
```

The merged head elements, with no `<head>` wrapper and none of the rest of the document. For a
layout that writes `<html>` itself.

```ts
html`<head>${head(parts, { nonce })}</head>`;
```

The merge is the same one `frame()` does, so a shared list of head assets behaves identically here.

## element

```ts
element(entry: HeadEntry, nonce?: string): Html
```

One entry, rendered.

```ts run
element({ tag: 'link', attrs: { rel: 'icon', href: '/icon.svg' } });
```

Throws [code 17](/reference/errors#e17) for a tag name that is not legal, and
[code 18](/reference/errors#e18) for a body on a void element.

## HeadEntry

```ts
interface HeadEntry {
  tag: string;
  attrs?: Record<string, AttrValue>;
  body?: Renderable;
  key?: string;
}
```

- `attrs` goes through [`attrs()`](/api/attrs), URL guard included — always the **default** guard,
  never one from `createHtml`.
- `body` is escaped if it is text, called if it is a function. A `<script>` or `<style>` body must
  be `Html`, from `raw()`, or it is [code 6](/reference/errors#e6).
- `key` overrides how the entry is identified for merging.

`FramePart` is `HeadEntry | Html`. Ready-made `Html` is passed through untouched — not merged, not
deduplicated, and not given a nonce.

## How entries merge

Of two entries with the same identity, the later one wins and takes the earlier one's position.

| tag                                           | identity                                       |
| --------------------------------------------- | ---------------------------------------------- |
| `title`, `base`                               | the tag; only one of each                      |
| `meta` with `charset`                         | charset; only one                              |
| `meta`                                        | its `name`, else `property`, else `http-equiv` |
| `link` with an icon `rel`                     | `rel` + `type` + `sizes`                       |
| `link` with `rel="canonical"` or `"manifest"` | the rel; only one of each                      |
| `link`                                        | `rel` + `href`                                 |
| `script` with `src`                           | the `src`                                      |
| anything else                                 | no identity; kept as many times as given       |
