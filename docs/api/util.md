# @itsy/html/util

```ts
import { join, map, range, when, choose, wrap, comment } from '@itsy/html/util';
```

Opt-in helpers with no shared state, one export each, so a bundler keeps only what is imported.

Everything except `comment` returns a plain array or the result of a thunk. Nothing here renders
markup or escapes anything; the template it lands in does that, for the context it lands in.

## join

```ts
join<I, J>(items: Iterable<I> | undefined, joiner: J): (I | J)[]
```

Puts `joiner` between the items.

```ts
html`<p>${join(tags.map(Tag), ', ')}</p>`;
```

The joiner is a value like any other, so a string is escaped and an `Html` is not. `undefined` items
give an empty array.

## map

```ts
map<T>(items: Iterable<T> | undefined, f: (item: T, index: number) => Renderable): Renderable[]
```

`Array.prototype.map` for anything iterable, with an index.

```ts
html`<ul>${map(ids, (id, i) => html`<li>${i}: ${id}</li>`)}</ul>`;
```

::: tip
This is for a `Set`, a `Map.values()` or a generator — things with no `.map` of their own. For an
array, call `.map` and skip the import.
:::

## range

```ts
range(end: number): number[]
range(start: number, end: number, step?: number): number[]
```

The integers from `start` up to but not including `end`. One argument means `range(0, end)`. A
negative step counts down.

```ts
range(5); // [0, 1, 2, 3, 4]
range(1, 10, 3); // [1, 4, 7]
html`<p>${map(range(5), Star)}</p>`;
```

## when

```ts
when<T, F>(condition: unknown, trueFn: () => T, falseFn?: () => F): T | F | undefined
```

One branch or the other, and only the chosen branch is built.

```ts
html`${when(user, () => Profile(user), () => Login())}`;
```

With no `falseFn`, a false condition renders nothing - so it is usually cleaner to just do `&&` in those cases.

## choose

```ts
choose<T, V>(value: T, cases: readonly (readonly [T, () => V])[], fallback?: () => V): V | undefined
```

A `switch` as an expression. The first case that matches (strict equivalence) will be rendered.

```ts
html`${choose(status, [
  ['ok', () => Ok()],
  ['err', () => Err()],
], () => Unknown())}`;
```

## wrap

```ts
wrap(items: Iterable<Renderable>, tag: string, attributes?: Record<string, AttrValue>): Renderable[]
```

Each item inside a `<tag>`, with optional attributes.

```ts run
html`<ul>${wrap(['a', 'b'], 'li', { class: 'name' })}</ul>`;
```

Items are rendered by the surrounding template, so text is escaped and `Html` is not. Attributes go
through `attrs()` with the **default** URL guard, not one from `createHtml`. A tag name that is not
a legal tag name throws [code 17](/reference/errors#e17).

Inside `<script>` and `<style>` every item must itself be `Html`, and anything else throws
[code 6](/reference/errors#e6): escaping keeps text from ending the block, but not from running.

## comment

```ts
comment(text: string): Html
```

An HTML comment the text cannot close early.

```ts run
html`${comment('closes early? --> no')}`;
```
