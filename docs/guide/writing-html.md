# Writing HTML

## Easier conditionals

`html` won't render keyword literals - so `true`, `false`, `null`, and `undefined` all result in an empty string.

```ts run
const error = false

html`<div>${error && html`<p class="err">${error}</p>`}</div>`;
```

## Functions are lazy

Functions are only run when the template renders.

```ts
html`<aside>${() => RelatedPosts(postId)}</aside>`;
```

## Slots

Slots work via parameters. They can be typed with `Renderable`. A slot can also be a function that returns a `Renderable`.

```ts run
import type { Renderable } from '@itsy/html';

const expensiveQuery = () => `I am so bougie!`
const Links = (str: string) => html`<p>${str}</p>`

const Card = ({ title, children, footer }: {
  title: string;
  children: Renderable;
  footer?: () => Renderable;
}) => html`
  <section class="card">
    <h2>${title}</h2>
    ${children}
    ${footer && html`<footer>${footer}</footer>`}
  </section>`;

Card({
  title: 'Hi',
  children: html`<p>body</p>`,
  footer: () => Links(expensiveQuery()),
});
```

## Iterables

All iterables flatten.

```ts run
html`<ul>${new Set(['a', 'b'])}</ul>`;
```

## Attributes

`attrs()` renders an object as attributes. `true` is a bare attribute, `false` and nullish are left out — except `aria-*`, `draggable`, `spellcheck` and `contenteditable`, which write `"true"` and `"false"` because both are meaningful.

```ts run
html`<button ${attrs({
  type: 'submit',
  disabled: false,
  hidden: true,
  'aria-expanded': false,
  style: { '--w': 10, color: null },
})}>Go</button>`;
```

`aria` and `data` take an object. `class` takes anything `cx()` takes.

```ts run
html`<li ${attrs({
  class: ['item', { selected: true, hidden: false }],
  aria: { expanded: false, controls: 'menu' },
  data: { category: 'x', active: true },
})}>…</li>`;
```

`cx()` on its own, for a class attribute written in the markup.

```ts run
const active = true;
html`<a class="${cx('link', active && 'is-active')}">…</a>`;
```

## Values

Strings are escaped, numbers print, `Html` is inserted as-is. Objects and Promises throw [code 7](/reference/errors#e7).

```ts run
html`<b>${'a < b'}</b> ${42n} ${html`<i>already html</i>`}`;
```

## Where a value can go

Text and quoted attributes are escaped. URL attributes are also [scheme-checked](/security/url-guard). Inside a tag use `attrs()`; inside `<script>`, `<style>` or a comment use `raw()`. Unquoted values and `on*` attributes throw — see [Checks](/guide/checks).

```ts run
html`
  <p title="${'"quoted"'}">${'<text>'}</p>
  <a href="${'javascript:alert(1)'}">blocked</a>
  <input ${attrs({ type: 'search' })}>
  <script>${raw('let x = 1')}</script>`;
```

## Whitespace

Line breaks and the indentation after them collapse to one space. `<pre>` and `<textarea>` are left alone. This behavior can be [disabled](/api/create#collapse) if needed.

```ts run
html`
  <ul>
    <li>a</li>
    <li>b</li>
  </ul>`;
```
