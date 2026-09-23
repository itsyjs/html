# Error codes

`HtmlError.code` is the same number in every build. The development build writes the message out in
full; the production build's message is `E` followed by the code.

| code       | meaning                                                                         | from                       |
| ---------- | ------------------------------------------------------------------------------- | -------------------------- |
| [2](#e2)   | an object or array for an attribute other than `class`, `style`, `aria`, `data` | `attrs`                    |
| [3](#e3)   | a refused attribute: anything starting with `on`                                | `html`, `attrs`            |
| [5](#e5)   | an unquoted attribute value before an expression                                | `html`                     |
| [6](#e6)   | a non-`Html` expression inside a tag, `<script>`, `<style>` or a comment        | `html`, `frame`            |
| [7](#e7)   | a value that cannot be rendered: an object, a `Promise`, a symbol               | `html`                     |
| [8](#e8)   | a tag never closed with `>`                                                     | `html`                     |
| [9](#e9)   | an element still open at the end, or one the next start tag closed for you      | `html`                     |
| [10](#e10) | an end tag that closes nothing, or the wrong element                            | `html`                     |
| [11](#e11) | `/>` on an element that does not self-close                                     | `html`                     |
| [12](#e12) | an end tag on a void element                                                    | `html`                     |
| [13](#e13) | nesting the browser rewrites                                                    | `html`                     |
| [14](#e14) | the same attribute twice on one tag                                             | `html`                     |
| [15](#e15) | an id reference with no matching id                                             | `check`                    |
| [16](#e16) | an id used twice                                                                | `check`                    |
| [17](#e17) | a bad tag name                                                                  | `frame`, `element`, `wrap` |
| [18](#e18) | a body on a void element                                                        | `frame`, `element`         |
| [19](#e19) | a URL the guard blocked                                                         | `check`                    |

Codes 1 and 4 are reserved.

**When they happen.** Codes 2, 3, 5, 6 and 7 throw the first time a template runs. Codes 8 to 14
throw at the same moment, but only in the development build. Codes 15, 16 and 19 are never thrown —
[`check()`](/api/check) returns them. Codes 17 and 18 throw whenever the offending entry is
rendered.

**What never throws.** Data. A hostile URL is replaced, hostile text is escaped, and neither stops
the render.

## Code 2 {#e2}

An object or array given for an attribute that does not take one.

```ts
attrs({ title: { a: 1 } }); // ✗
attrs({ class: ['a', 'b'], style: { color: 'red' } }); // fine
```

Four keys take objects or arrays: `class`, `style`, `aria` and `data`. Everything else takes a
string, number, bigint, boolean, `null` or `undefined`.

## Code 3 {#e3}

An attribute starting with `on`, anywhere, with any value.

```ts
html`<button onclick="${handler}">…</button>`; // ✗
attrs({ onclick: handler }); // ✗
```

The value is code, so no escaping makes it safe — and that holds for `null` and for `Html` too, so
the refusal is unconditional. Attach behaviour with `addEventListener`; see
[in a browser](/recipes/client#behaviour-goes-on-with-a-listener).

::: warning
The check is a prefix, so a custom element's `one` or `online` attribute is refused as well. A
prefix is the only thing that can be relied on here. Rename the attribute, or write the whole tag
inside `raw()`.
:::

## Code 5 {#e5}

An expression in an attribute value with no quotes around it.

```ts
html`<a href=${url}>…</a>`; // ✗
html`<a href="${url}">…</a>`; // fine
```

An unquoted value ends at the first whitespace, so a space anywhere in the value starts a new
attribute. Escaping cannot fix that — the quotes have to be there.

## Code 6 {#e6}

An expression that is not `Html` in a context where only markup can go.

```ts
html`<input ${flag}>`; // ✗ inside a tag
html`<script>${code}</script>`; // ✗ inside a script
html`<!-- ${note} -->`; // ✗ inside a comment
html`<${name}>`; // ✗ right after `<`, where the tag's name goes
```

Right after a `<` counts as inside a tag: a value that starts with a letter would be read as the
tag's name, so `img src=x onerror=…` would open an `<img>` of its own. Write `&lt;` for a literal
less-than sign, or put a tag name you trust in `raw()`.

A `<script>` or `<style>` with a `<!--` or `<![CDATA[` still open counts as inside it, past its end
tag: in an SVG script, and in the escaped states of an HTML one, the browser reads that end tag as
text.

Inside a tag, use [`attrs()`](/api/attrs). Inside `<script>`, `<style>` or a comment, use `raw()` —
and read [data in a script block](/security/limits#data-in-a-script-block) before you put JSON
there. For untrusted comment text, [`comment()`](/api/util#comment) escapes it safely.

This is also the code a [`frame`](/api/frame) script or style entry throws when its body is a plain
string rather than `Html`, and the one [`wrap()`](/api/util#wrap) throws for such an item in
`<script>` or `<style>`: escaped text there still runs.

## Code 7 {#e7}

A value with no sensible string form.

```ts
html`<p>${{ a: 1 }}</p>`; // ✗ object
html`<p>${fetchUser()}</p>`; // ✗ Promise
```

Await before you build the template. For an object, pass the property you meant. TypeScript reports
this first: the parameter type is `Renderable`, so neither one typechecks.

## Code 8 {#e8}

A tag that never reaches its `>`.

```ts
html`<div class="a" <p>`; // ✗
```

::: details What the browser does
Reads the `<p` as an attribute name on the `div`, so you get one element with an attribute called
`<p` and no paragraph at all.
:::

## Code 9 {#e9}

An element still open when the template ends, or one that the next start tag closed for you.

```ts
html`<div><p>x</p>`; // ✗ the div is never closed
html`<ul><li>a<li>b</ul>`; // ✗ the second <li> closed the first
```

::: details What the browser does
An unclosed element swallows whatever follows it — in a list of components, the next sibling ends up
inside the previous one. HTML does permit omitting `</li>`, `</p>` and some others, but in a
template the likelier reading is that you forgot.

The browser closes more for you than the spec's list of end tags you may leave out: a `<p>` at any
block such as `<xmp>` or `<listing>`, an `<option>` at an `<hr>`, a table cell, row or section at any
table part that cannot sit in it. Each is reported where the parser does it.
:::

To open in one template and close in another, say so with `raw()`:

```ts
const open = html`${raw('<main class="page">')}<h1>${title}</h1>`;
const close = html`${raw('</main>')}`;
```

## Code 10 {#e10}

An end tag closing the wrong element, or nothing at all.

```ts
html`<b><i>x</b>`; // ✗
html`</p>`; // ✗ closes nothing
```

::: details What the browser does
Closes the wrong element, then re-opens what it had to close. A stray `</p>` makes the parser insert
an empty `<p></p>`, which is why unexplained empty paragraphs turn up in rendered pages.
:::

## Code 11 {#e11}

`/>` on an element that does not self-close.

```ts
html`<div />`; // ✗
html`<my-element />`; // ✗ custom elements do not self-close either
html`<br />`; // fine: void element
```

::: details What the browser does
Ignores the slash, opens the element, and never closes it. Everything after it ends up inside.

`/>` does self-close inside `<svg>` and `<math>`, and the check follows that.
:::

A formatter is a common cause — Prettier and oxfmt rewrite `<br>` to `<br />` inside templates
unless you [turn embedded formatting off](/recipes/tooling#formatters-rewrite-your-markup).

## Code 12 {#e12}

An end tag for an element that never has one.

```ts
html`</br>`; // ✗
html`<img src="${url}"></img>`; // ✗
```

::: details What the browser does
`</br>` inserts a second `<br>`. Other void end tags are ignored, so the markup is merely wrong
rather than harmful.
:::

## Code 13 {#e13}

Nesting the parser refuses to keep.

```ts
html`<p><div>x</div></p>`; // ✗
html`<a href="${x}"><a href="${y}">…</a></a>`; // ✗
html`<table><tr><td>x</td></tr></table>`; // ✗ no tbody
html`<table> total: <tr>…</tr></table>`; // ✗ text directly in a table
html`<svg><p>x</p></svg>`; // ✗ an HTML tag that ends the SVG
html`<body>…</body><script src="a.js"></script>`; // ✗ after </body>
html`<div><tr><td>x</td></tr></div>`; // ✗ table parts outside a table
html`<table><svg>…</svg></table>`; // ✗ anything but a table part, in a table
html`<body><body class="x">…</body></body>`; // ✗ a second <body>
```

::: details What the browser does
Rewrites it. A `<div>` inside a `<p>` closes the paragraph first, leaving an empty `<p></p>` before
the div and a stray `</p>` after it. A nested `<a>` is moved out. A `<tr>` with no `<tbody>` gets
one inserted, so a CSS selector or a `querySelector` written against your markup misses. Text
directly inside a table is moved out in front of it. Inside SVG or MathML, an HTML tag such as
`<p>`, `<div>` or `<img>` closes the foreign content and starts over as HTML. Anything after
`</body>` is moved back into the body, and anything that belongs in the head, after `</head>`, back
into the head. A `<tr>`, `<td>` or other table part outside a table is dropped, with its text kept.
A second `<html>` or `<body>` is dropped and its attributes added to the first, and a `<head>` after
the head is dropped.
:::

## Code 14 {#e14}

The same attribute written twice on one tag.

```ts
html`<a class="a" class="b">…</a>`; // ✗
```

::: details What the browser does
Keeps the first and discards the second, silently — usually the opposite of what was intended, since
the later one is normally the override.
:::

## Code 15 {#e15}

An id reference that points at no id on the page. Reported by [`check()`](/api/check) only, since a
single template cannot see the whole page.

```ts
html`<label for="email">Email</label>`; // ✗ if no element has id="email"
```

Checked on `for`, `form`, `list`, `headers`, `popovertarget`, `commandfor`, `itemref` and the
`aria-*` relations. A broken `for` means clicking the label does nothing and the input has no
accessible name.

Pass `check(markup, { ids: false })` when checking a fragment whose references point outside it.

## Code 16 {#e16}

The same id on two elements. `check()` only.

```ts
html`<div id="main"></div><div id="main"></div>`; // ✗
```

Every id reference then resolves to the first, and `getElementById` returns the first.

## Code 17 {#e17}

A tag name that is not a legal tag name, where a tag is built from a string.

```ts
wrap(names, 'li li'); // ✗
element({ tag: '<script>' }); // ✗
```

A legal name starts with a letter and continues with letters, digits, `-` or `_`. This is the guard
on the places that take a tag name as data: [`wrap()`](/api/util#wrap),
[`element()`](/api/frame#element) and `frame` entries.

## Code 18 {#e18}

A body on an element that cannot have one.

```ts
element({ tag: 'meta', attrs: { charset: 'utf-8' }, body: 'x' }); // ✗
```

Void elements — `meta`, `link`, `br`, `img` and the rest — have no end tag, so there is nowhere for
a body to go.

## Code 19 {#e19}

A URL [the guard](/security/url-guard) replaced with `about:blank#blocked`. Reported by
[`check()`](/api/check), never thrown, because the URL came from data rather than from your markup.

```ts
check(String(html`<a href="${'javascript:alert(1)'}">x</a>`));
// [{ code: 19, … }]
```

Finding one means something upstream produced a URL with a scheme outside the allowed set. Either
the data is wrong, or the scheme is one you meant to allow — see [adding a
scheme](/security/url-guard#adding-a-scheme).
