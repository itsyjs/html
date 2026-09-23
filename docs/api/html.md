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
| right after `<`       | `raw()` only: the browser reads a value there as a tag name |
| `<script>`, `<style>` | `raw()` only                                                |
| comment               | `raw()` only                                                |

- The scan reads only the static strings, so a value can never change which context it lands in.
- It runs once per template, cached on the strings array, so a markup error throws on the first
  render and repeated renders do no extra work.
- Unquoted attribute values and `on*` attributes are refused at scan time, whatever the value.
- A `<script>` or `<style>` with a `<!--` or `<![CDATA[` still open does not end at its end tag: the
  browser may read that tag as text, so the scan keeps the block open, and a value after it is
  refused rather than escaped for a context it may not be in.

## raw

```ts
raw(markup: string): Html
```

Marks a string as HTML that is already safe.

```ts
html`<div>${raw(sanitized)}</div>`;
```

## Html {#html-class}

The return type. A small wrapper around the markup, not a string.

```ts
view.markup; // the markup itself: no coercion, typed as a string
String(view); // same thing, via toString()
`${view}`;
el.innerHTML = view; // coerces too, though TypeScript will be grumpy about it
```

Prefer `view.markup` where you have an `Html` in hand. It is a property read rather than a
coercion, and it says what you mean.

::: warning
It is an object. `typeof` reports `'object'` and an empty one is truthy, so coerce where a
primitive is due.
:::

It behaves at the boundaries you would expect it to:

|                                        |                                                                                                                        |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `console.log(view)`                    | prints `Html '<p>…</p>'` in the development build                                                                      |
| `JSON.stringify({ view })`             | gives the markup — there is a `toJSON`                                                                                 |
| `Object.prototype.toString.call(view)` | `[object Html]`                                                                                                        |
| `${view}`, `view + ''`, `String(view)` | all go through one `Symbol.toPrimitive`, a nanosecond or so cheaper than the `toString` lookup they would otherwise do |

The inspect hook is development-only — it is a debugging affordance, and the production build
trades messages for bytes everywhere else too.

A `#private` field makes TypeScript treat it as its own type, so a plain string will not pass
where an `Html` is expected. `raw` and `html` are the only ways you should create one.

`instanceof` and [`isHtml`](#ishtml) both match on a realm-global brand rather than the prototype
chain, so two copies of this library in one dependency tree still recognise each other's `Html`.
Without that, a nested template from the other copy would be escaped as if it were text, silently.
It is forgeable, but so is `raw()` — both need code running in your process.

### Why it is not a `String` subclass

It would be the obvious design, and it is a trap. Subclassing a builtin makes V8 give up the fast
paths for `String.prototype` methods across the **entire process** — not just for the subclass,
and not just for this library. `charCodeAt` alone gets about 9x slower, and the escaper calls it
once per character. Merely declaring the class does it; no instance is needed.

This library shipped that mistake and measured the cost: removing it made rendering 1.75x to 2.89x
faster, and stopped penalising every other library in the process by up to 2.8x. JavaScriptCore
shows no such penalty, so it is a V8 implementation choice rather than a cost the language
requires. TC39 has a [proposal to remove builtin subclassing][rm-subclassing] for this family of
reasons.

[rm-subclassing]: https://github.com/tc39/proposal-rm-builtin-subclassing

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
