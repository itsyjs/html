# @itsy/html/attrs

```ts
import { attrs, cx, esc } from '@itsy/html/attrs';
```

Independent of the template scanner. `attrs` and `cx` are also exported from the root, so importing
from here is only worth it when you want nothing else from the library.

## attrs

```ts
attrs(values: Record<string, AttrValue>): Html
```

Renders attributes for use inside a tag.

```ts
html`<input ${attrs({ type: 'search', disabled: busy, class: ['field', error && 'is-invalid'] })}>`;
```

| key             | behaviour                                                        |
| --------------- | ---------------------------------------------------------------- |
| `class`         | anything [`cx()`](#cx) accepts                                   |
| `style`         | an object; keys written as given, `null` and `undefined` dropped |
| `aria`          | an object, spread to `aria-*`                                    |
| `data`          | an object, spread to `data-*`                                    |
| a URL attribute | escaped and [scheme-checked](/security/url-guard)                |
| anything else   | escaped                                                          |

Booleans follow [two rules](/guide/writing-html#attributes): `aria-*`, `draggable`, `spellcheck` and
`contenteditable` render `"true"` and `"false"`; every other attribute renders the bare name for
`true` and is left out for `false`.

Attribute names are written out exactly as given — no camelCase conversion, no list of known
attributes.

Throws [code 2](/reference/errors#e2) for an object or array on a key other than the four above,
and [code 3](/reference/errors#e3) for any `on*` key.

## cx

```ts
cx(...values: ClassValue[]): string
```

Joins class names. Falsy values and `true` contribute nothing.

```ts
cx('btn', active && 'btn-active'); // 'btn btn-active'
cx({ open, disabled: !ready }); // keys whose value is truthy
cx(['a', ['b', null]], 0, '', undefined); // 'a b'
```

Returns a plain string, so it is escaped like any other value when it lands in a template.

## esc

```ts
esc(text: string): string
```

Escapes `&`, `<`, `>`, `"` and `'`. It is what the renderer uses for text and attribute values.

You need it only when assembling markup by hand to hand to `raw()`. Prefer putting the value in a
template, where the escaping is chosen by context rather than by you.
