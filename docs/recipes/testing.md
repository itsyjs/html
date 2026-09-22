# Testing

Components are functions returning strings, so they need no renderer, no DOM and no test harness
beyond whatever you already run.

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

const Item = (label: string) => html`<li>${label}</li>`;

test('escapes the label', () => {
  assert.equal(String(Item('a < b')), '<li>a &lt; b</li>');
});
```

## Assert the markup is clean

`check()` returns the problems in a rendered page, so the general-purpose assertion is that there
are none.

```ts
import { check } from '@itsy/html/check';

test('the page is well formed', () => {
  assert.deepEqual(check(Page(data)), []);
});
```

That one line covers unclosed tags, mismatched end tags, nesting a browser would rewrite, duplicate
attributes, duplicate ids, id references pointing nowhere, any URL the guard blocked, and the
[accessibility rules](/api/check#accessibility). Run it over the page rather than a fragment — the
ids and the references are only visible at page level, and so are the `<html>`, the `<title>` and
the `for` targets that three of the accessibility rules read.

Pass `{ a11y: false }` for the markup check on its own.

When it fails, the array says where:

```ts
for (const p of check(Page(data))) console.log('rule' in p ? p.rule : p.code, p.message, p.near);
```

## Make sure you are on the dev build

In the production build `check()` always returns `[]`. A suite that resolves the production build
will pass every markup assertion you write, whatever the markup is.

Run tests with the condition set:

```sh
node --conditions=development --test test/*.test.ts
```

And to be certain the suite cannot pass vacuously, assert that the checks are on. `check.enabled`
is `false` on the production build:

```ts
test('the checks are active', () => assert(check.enabled));
```

::: tip
Vitest resolves through Vite, which applies the `development` condition in dev. If you are unsure
what your runner resolved, the assertion above answers it in one run.
:::

## Storybook

A decorator runs the check on every story, so a broken component fails where you are already
looking.

```ts
// .storybook/preview.ts
export const decorators = [
  (story) => {
    const markup = String(story());
    for (const p of check(markup)) console.warn(`[${'rule' in p ? p.rule : `html ${p.code}`}] ${p.message}`, p.near);
    return markup;
  },
];
```

## Snapshots

Snapshot `String(view)`, never the `Html` itself — a serializer will otherwise record an object.

```ts
expect(String(Page(data))).toMatchSnapshot(); // or whatever your runner calls it
```

Whitespace in the output is stable: [static markup collapses to single
spaces](/guide/writing-html#whitespace), so reindenting your template does not churn the snapshot. Reflowing a
line does, since a newline becomes a space.
