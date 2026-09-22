# @itsy/html/check

```ts
import { check } from '@itsy/html/check';
import type { Problem, Finding, RuleSet, Visitor, Report, A11yRule, A11yOptions, CheckOptions } from '@itsy/html/check';
```

Everything the library checks lives here: the [markup check](/guide/checks) over a rendered page,
[twenty-three accessibility rules](#accessibility) that run by default, and the
[hook for your own rules](#your-own-rules). All of it is development-only — the production build
compiles `check` down to a function that immediately returns an empty array, 28 bytes.

## check

```ts
check(markup: string | Html, options?: CheckOptions): (Problem | Finding)[]
```

Runs the checks over a rendered string rather than a single template, and returns what it found in
page order. Empty means clean.

```ts
assert.deepEqual(check(Page(data)), []);
```

Because it sees the finished page, it catches what one `html` call cannot:

- problems that span two templates, or hide inside `attrs()` output
- [code 15](/reference/errors#e15), an id reference with no matching id
- [code 16](/reference/errors#e16), an id used twice
- [code 19](/reference/errors#e19), a URL the guard replaced with `about:blank#blocked`
- the [accessibility rules](#accessibility), which need the finished markup for the same reason

::: danger Always `[]` in the production build
There is no check in the production build, so `check()` there returns an empty array whatever you
pass it. A test suite that resolves the production build will pass every assertion based on it.
Assert [`check.enabled`](#check-enabled) once and it cannot. See [make sure you are on the dev
build](/recipes/testing#make-sure-you-are-on-the-dev-build).
:::

## CheckOptions

```ts
interface CheckOptions {
  ids?: boolean; // default true
  a11y?: boolean | A11yOptions; // default true
  rules?: RuleSet | readonly RuleSet[];
}

interface A11yOptions {
  without?: readonly A11yRule[]; // rules to silence, by name
}
```

`ids: false` turns off codes 15 and 16. Use it when checking a fragment rather than a page, where
an id reference pointing outside the fragment is expected.

`a11y: false` leaves only the markup check, and narrows the return type back to `Problem[]`.

`rules` runs [your own rules](#your-own-rules) in the same pass.

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

In a template, a `${…}` counts as those four characters when `at` is computed.

## Finding

What a rule reports. The list holds both shapes, and the two are told apart by their first field:

```ts
interface Finding {
  rule: string; // which rule found it, e.g. img-alt
  message: string; // what is wrong, and what it means for a person using the page
  at: number;
  near: string;
}

for (const p of check(view)) {
  if ('rule' in p) console.warn(`[${p.rule}] ${p.message}`, p.near);
  else console.warn(`[html ${p.code}] ${p.message}`, p.near);
}
```

Names, not numbers, and deliberately: these are not [`HtmlError` codes](/reference/errors). Nothing
here ever throws, and a name says what it found without a lookup.

## Accessibility

Advice rather than correctness, but in the same pass and the same list, because a finding you have
to ask for is a finding nobody sees. They cost nothing to leave on: they compile away with the rest
of `check()`.

An empty list means these rules found nothing, not that the page is accessible.

| rule                            | fires on                                                             |
| ------------------------------- | -------------------------------------------------------------------- |
| `img-alt`                       | `<img>` with no `alt`                                                |
| `img-alt-filename`              | `alt` that is only a file name, like `photo-3.png`                   |
| `a-href`                        | `<a>` with no `href`, `id`, `name`, `tabindex` or `role`             |
| `html-lang`                     | `<html>` with no `lang`                                              |
| `iframe-title`                  | `<iframe>` with no `title`                                           |
| `empty-heading`                 | `<h1>`…`<h6>` with no text and nothing naming it                     |
| `empty-link`                    | `<a href>` with no text and nothing naming it                        |
| `empty-button`                  | `<button>` with no text and nothing naming it                        |
| `empty-title`                   | `<title>` with no text                                               |
| `label-control`                 | `<label>` with no `for` and no control inside it                     |
| `label-for`                     | `for=` pointing at something that is not a form control              |
| `aria-unknown`                  | an `aria-*` name that does not exist                                 |
| `aria-empty`                    | an `aria-*` attribute or `role` with an empty value                  |
| `aria-boolean`                  | a true/false ARIA attribute given something else                     |
| `aria-live`                     | `aria-live` outside `polite`, `assertive` and `off`                  |
| `aria-hidden-focus`             | `aria-hidden="true"` on something the keyboard can tab to            |
| `positive-tabindex`             | `tabindex` above zero                                                |
| `figcaption-parent`             | `<figcaption>` that is not a direct child of `<figure>`              |
| `misplaced-scope`               | `scope` on anything but `<th>`                                       |
| `role-unknown`                  | a `role` that is not an ARIA role                                    |
| `role-redundant`                | a `role` the element already had                                     |
| `role-required-props`           | a role with no state to read, like `checkbox` with no `aria-checked` |
| `role-presentation-interactive` | `role="presentation"` on something focusable                         |

```ts run
check('<img src="cat.jpg"><button><svg></svg></button><nav role="navigation">x</nav>');
```

### Turning rules off

```ts
check(view, { a11y: { without: ['img-alt-filename', 'positive-tabindex'] } });
```

The names are checked against `A11yRule`, the union of the twenty-three above, so a typo is a type
error rather than a rule that quietly stays on:

```ts
check(view).some((p) => 'rule' in p && p.rule === 'img-altt'); // ✗ type error
```

Reach for it when a rule is wrong for a whole codebase. `a11y: false` turns the lot off.

### Turning one element off

Prefer markup that says why. The rules already respect the attributes that mean "no name needed",
and unlike a suppression comment those tell a screen reader the same thing:

```ts run
[
  check('<img src="hero.jpg" alt="">'), // decoration, said properly
  check('<img src="hero.jpg" role="presentation">'),
  check('<img src="hero.jpg" aria-hidden="true">'),
  check('<div hidden><img src="hero.jpg"></div>'),
];
```

There is no `data-a11y-ignore` attribute and there will not be one. This library renders exactly
what you write, so a suppression marker would ship to every visitor — an ESLint comment is stripped
at build, an attribute is not.

### Quiet by design

A rule that fires on correct markup is worse than one that misses a bug, because one wrong finding
is all it takes for someone to switch the whole thing off. So the rules stay quiet whenever they
cannot be sure:

- Nothing inside `hidden`, `inert`, `display:none`, `aria-hidden="true"` or `<template>` is
  reported. None of it reaches the person the rules are about.
- A custom element can hold anything, so it silences the rule around it — a `<my-input>` inside a
  `<label>` counts as the control, and a `<my-icon>` inside a `<button>` counts as a name.
- `alt=""`, `role="presentation"` and `role="none"` are how you say an image is decoration, and all
  three are respected.
- A name from `aria-label`, `aria-labelledby` or `title`, on the element or on anything inside it,
  counts as text. `<button><img src="i.svg" alt="Delete"></button>` is silent.
- The role tables hold only the mappings the markup settles on its own. `<header role="banner">`,
  `<aside role="complementary">`, `<li role="listitem">` and `<option role="option">` depend on an
  ancestor, so none of them is reported as redundant.
- Nor is `<ul role="list">`, or `role="table"`, `role="caption"`, `role="rowgroup"` and
  `role="row"` on the table elements that already have them. Safari drops the list role from a
  list styled `list-style: none`, browsers have dropped the table roles from a table given another
  `display`, and restating the role is how you put it back.
- An `<input>` keeps its own state whatever role it is given. `<input type="checkbox" role="switch">`
  is the native switch, and needs no `aria-checked` — ARIA in HTML forbids one. A text input with
  a `list` is a combobox already, and needs no `aria-expanded`.
- `role` takes a fallback list, and the browser uses the first entry it knows. A role from another
  vocabulary, such as DPUB-ARIA's `doc-*`, or WebKit's `role="text"`, may be that entry, so the
  role rules stop at one.
- The rules that need the full role-to-properties graph — which `aria-*` each role allows — are
  left out. That table is the largest and the easiest one to be wrong with.

## Your own rules

`rules` runs a project's own rules in the same walk, reporting into the same list: house style,
design-system constraints, anything that reads as markup.

```ts run
const noInlineStyle = (report) => ({
  open(tag, attrs, at) {
    if (attrs.has('style')) report('no-inline-style', `\`<${tag} style>\`: use a utility class`, at);
  },
});

check('<p style="color:red">x</p>', { a11y: false, rules: noInlineStyle });
```

```ts
type RuleSet = (report: Report) => Visitor;
type Report = (rule: string, message: string, at: number) => void;

interface Visitor {
  open?: (tag: string, attrs: ReadonlyMap<string, string>, at: number, ancestors: readonly string[]) => void;
  text?: (content: string, at: number) => void;
  close?: (tag: string, at: number, hadText: boolean) => void;
  end?: (ids: ReadonlyMap<string, number>) => void;
}
```

A rule set is called once per `check()` and returns a visitor, so per-run state goes in the
closure. Every hook is optional, and `near` is filled in for you — a rule never looks at the markup
itself.

- **`open`** — a start tag. `attrs` has lowercased names and verbatim values; a bare attribute is
  present with an empty value. `ancestors` is outermost first, and holds what is _really_ open:
  anything the browser would have closed already is closed. Both are yours to keep. A void element
  opens and never closes.
- **`text`** — a run of text, as written, and never empty. Entities are not decoded, and a `<` that
  opens no tag is part of the text, as the browser reads it. It fires for the body of `<script>`,
  `<style>`, `<textarea>` and `<title>` too.
- **`close`** — `at` is where the element _started_, so it pairs with `open`. `hadText` says
  whether it held any non-whitespace.
- **`end`** — every id on the page and where it was seen.

Pass an array to run several. Findings from all of them are sorted into page order with the markup
problems, so the list reads top to bottom whatever produced it.

Your rule names are yours, so passing `rules` widens the result to `Finding<string>`.

::: tip This is a development-only surface
It ships as nothing, so it can afford to be generous — and it is versioned more loosely than the
renderer. A rule set that throws will take `check()` down with it.
:::

## check.enabled

```ts
check.enabled; // true here, false in the production build
```

`check()` returns `[]` in the production build, so a suite that resolves it passes every assertion
built on `check()` without looking at anything. Assert this once and it cannot:

```ts
test('the checks are active', () => assert(check.enabled));
```

See [make sure you are on the dev build](/recipes/testing#make-sure-you-are-on-the-dev-build).
