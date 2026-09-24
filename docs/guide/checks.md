# Checks

This page details how to use checks that are included for accessibility, security, and avoiding typos that would cause unintended HTML.

## Setup

```ts
import { check } from '@itsy/html/check';

app.get('/', (req, res) => {
  const view = Page(data); // a broken template throws HtmlError here

  // the whole page: ids, blocked URLs, accessibility. [] in production
  for (const p of check(view)) console.warn('rule' in p ? p.rule : `E${p.code}`, p.message, p.near);

  res.send(view.markup);
});
```

::: details What checks are run where

| run by          | checks                                                                                                                                                                                                                                    | result               | build                                |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------ |
| `html`          | [3](/reference/errors#e3), [5](/reference/errors#e5), [6](/reference/errors#e6), [7](/reference/errors#e7): an `on*` attribute, an unquoted attribute value, a plain string inside a tag or `<script>`, an object or `Promise` as a value | throws `HtmlError`   | both                                 |
| `html`          | [8–14](/reference/errors#e8): markup the browser would repair                                                                                                                                                                             | throws `HtmlError`   | development only                     |
| `attrs`         | [2](/reference/errors#e2), [3](/reference/errors#e3): an object for a plain attribute, an `on*` name                                                                                                                                      | throws `HtmlError`   | both                                 |
| `frame`, `wrap` | [6](/reference/errors#e6), [17](/reference/errors#e17), [18](/reference/errors#e18): a `<script>` body that is not `Html`, an invalid tag name, a body on a void element                                                                  | throws `HtmlError`   | both                                 |
| `check()`       | [8–16, 19](/reference/errors#e8): the markup check across templates, ids, blocked URLs                                                                                                                                                    | a `Problem` for each | development only, `[]` in production |
| `check()`       | [accessibility rules](/api/check#accessibility), on by default                                                                                                                                                                            | a `Finding` for each | development only, `[]` in production |

`HtmlError.code` is the same in both builds; production's message is `E` plus the code. Bundlers pick the development build with the `development` condition — [bundlers and editors](/recipes/tooling).

:::

## Markup check

Browsers repair broken HTML silently, which can have unintended effects.

Codes [8 to 14](/reference/errors#e8) call out these errors - for example, if a tag isn't closed, a closing mark (`/>`) on an element that does not self-close, etc.

```ts run
html`<div><p>x</p>`;
```

If a tag needs to be left open so it can be closed elsewhere - use `raw`.

```ts run
html`${raw('<main class="page">')}<h1>${'title'}</h1>`;
```

## check()

Validates the rules detailed above, plus id references, duplicate ids, and blocked URLs.

```ts run
check('<label for="email">Email</label><div id="x"></div><div id="x"></div><a href="about:blank#blocked">x</a>');
```

Pass `{ ids: false }` when the markup is a partial-fragment, e.g. a `for` or `aria-*` reference is outside the markup being passed.

## Accessibility

[See more details about what rules are available here](/api/check#accessibility).

```ts run
check('<img src="cat.jpg"><button><svg></svg></button><a href="/skip" aria-hidden="true">Skip</a>');
```

`a11y: { without: [...] }` turns a rule off for a whole codebase, and `a11y: false` turns the lot
off. The names are typed, so a typo is a type error.

```ts run
check('<img src="photo-3.png" alt="photo-3.png">', { a11y: { without: ['img-alt-filename'] } });
```

## Custom rules

`rules` runs a project's rules in the same pass and reports them into the same list.
[The hooks](/api/check#custom-rules).

```ts run
check('<p style="color:red">x</p>', {
  a11y: false,
  rules: (report) => ({
    open: (tag, attrs, at) => attrs.has('style') && report('no-inline-style', 'use a utility class', at),
  }),
});
```
