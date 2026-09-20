# @itsy/html/check

```ts
import { check } from '@itsy/html/check';
import type { Problem, CheckOptions } from '@itsy/html/check';
```

The production build compiles `check` down to a function that immediately returns an empty array.

## check

```ts
check(markup: string | Html, options?: CheckOptions): Problem[]
```

Runs the [markup check](/guide/checks) over a rendered string rather than a single
template. Returns an array of problems in page order - which is empty when clean.

```ts
assert.deepEqual(check(Page(data)), []);
```

Because it sees the finished page, it catches what one a single `html` call cannot:

- problems that span two templates, or hide inside `attrs()` output
- [code 15](/reference/errors#e15), an id reference with no matching id
- [code 16](/reference/errors#e16), an id used twice
- [code 19](/reference/errors#e19), a URL the guard replaced with `about:blank#blocked`

::: danger Always `[]` in the production build
There is no markup check in the production build, so `check()` there returns an empty array
whatever you pass it. A test suite that resolves the production build will pass every assertion
based on it. See [make sure you are on the dev
build](/recipes/testing#make-sure-you-are-on-the-dev-build).
:::

## CheckOptions

```ts
interface CheckOptions {
  ids?: boolean; // default true
  a11y?: RuleSet; // the rules from @itsy/html/a11y
}
```

`ids: false` turns off codes 15 and 16. Use it when checking a fragment rather than a page, where an
id reference pointing outside the fragment is expected.

`a11y` runs the [accessibility rules](/api/a11y) in the same pass, reporting into the same list.
`check` does not import them, so they are bundled only where you pass them:

```ts
import { a11y } from '@itsy/html/a11y';

assert.deepEqual(check(Page(data), { a11y }), []);
```

The ids checked are `for`, `form`, `list`, `headers`, `popovertarget`, `commandfor`, `itemref` and
the `aria-*` relations.

## Problem

```ts
interface Problem {
  code: number; // the same numbers as HtmlError.code
  message: string; // what is wrong, and what the browser does instead
  at: number; // character offset into the markup
  near: string; // the markup around `at`, whitespace squeezed
}
```

```ts
for (const p of check(view)) console.warn(`[html ${p.code}] ${p.message}`, p.near);
```

In a template, a `${…}` counts as those four characters when `at` is computed.

## Finding

With `a11y` passed, the list holds both shapes, and the two are told apart by their first field:

```ts
interface Finding {
  rule: string; // which rule found it, e.g. img-alt
  message: string;
  at: number;
  near: string;
}

for (const p of check(view, { a11y })) {
  if ('rule' in p) console.warn(`[${p.rule}] ${p.message}`, p.near);
  else console.warn(`[html ${p.code}] ${p.message}`, p.near);
}
```

Without `a11y` the return type is `Problem[]` exactly as before, so existing code reading `p.code`
needs no change.
