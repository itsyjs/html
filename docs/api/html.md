# @itsy/html

```ts
import { html, attrs, cx, raw, Html, isHtml, HtmlError } from '@itsy/html';
import type { Renderable, AttrValue, AttrGroup, ClassValue, StyleValue } from '@itsy/html';
```

## html

A template tag. Returns [`Html`](#html-class).

```ts
html`<p class="${cls}">${text}</p>`;
```

Each value is escaped for the context it lands in. Throws [`HtmlError`](#htmlerror) on the first
render of a template that breaks a rule. Values never throw except for [code 7](/reference/errors#e7).

### Contexts

| context               | treatment                                                   |
| --------------------- | ----------------------------------------------------------- |
| text                  | `&`, `<`, `>`, `"`, `'` escaped                             |
| quoted attribute      | the same escape                                             |
| URL attribute         | the same escape, then [a scheme check](/security/url-guard) |
| inside a tag          | `attrs()` or `raw()` only                                   |
| `<script>`, `<style>` | `raw()` only                                                |
| comment               | `raw()` only                                                |

- The scan reads only the static strings, so a value can never change which context it lands in.
- It runs once per template, cached on the strings array, so a markup error throws on the first
  render and repeated renders do no extra work.
- Unquoted attribute values and `on*` attributes are refused at scan time, whatever the value.

## raw

```ts
raw(markup: string): Html
```

Marks a string as HTML that is already safe.

```ts
html`<div>${raw(sanitized)}</div>`;
```

## Html {#html-class}

The return type.

```ts
el.innerHTML = view; // this would coerce to String, but Typescript will be grumpy about it
String(view);
`${view}`;
```

::: warning
It is an object. `typeof` reports `'object'`, an empty one is truthy, and anything that serializes
objects to JSON will not give you the markup. Use `String(view)` at those boundaries.
:::

A private field makes TypeScript treat it as its own type, so a plain string will not pass where an
`Html` is expected. `raw` and `html` are the only ways to create `Html`.

## isHtml

```ts
isHtml(value: unknown): value is Html
```

`true` for anything from `html` or `raw` - thus a plain string is `false`.

## HtmlError

```ts
class HtmlError extends Error {
  name: 'HtmlError';
  code: number;
}
```

`code` is the same number in both development and production builds. In the development build `message` spells the problem
out; in production it is `E<code>`.

[See error codes here](/reference/errors).

## attrs and cx

Re-exported from [`@itsy/html/attrs`](/api/attrs).

## Types

`Renderable` is what a template accepts and the most common type to import.

[See other types here](/reference/types).
