# Checks

This page details how to use checks that are included for accessibility, security, and avoiding typos that would cause unintended HTML.

| check                        | fires                                               | build                                | setup                             |
| ---------------------------- | --------------------------------------------------- | ------------------------------------ | --------------------------------- |
| renderer refusals, codes 2-7 | first render of a template, throws `HtmlError`      | both                                 | none                              |
| markup check, codes 8–14     | first render of a template, throws `HtmlError`      | development only                     | resolve the development build     |
| `check()`, codes 8–16 and 19 | when called on a rendered page, returns `Problem[]` | development only, `[]` in production | `@itsy/html/check`                |
| accessibility rules          | inside `check()`, returns `Finding[]` by rule name  | development only                     | `{ a11y }` from `@itsy/html/a11y` |

`HtmlError.code` is the same in both builds; production's message is `E` plus the code. Bundlers pick the development build with the `development` condition — [bundlers and editors](/recipes/tooling).

## Markup check

Browsers repair broken HTML silently. These throw instead. It is not HTML validation — html-validate or a similar linter is needed for that.

Codes [8 to 14](/reference/errors#e8): a tag never closed, an end tag that closes the wrong thing, `/>` on an element that does not self-close, nesting the browser rewrites, the same attribute twice.

```ts run
html`<div><p>x</p>`;
```

A tag left open on purpose, to close in another template, goes through `raw()`.

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

Advice, not errors: a `Finding` carries a rule name instead of a code, and an empty list means these rules found nothing, not that the page is accessible. [The rules](/api/a11y#the-rules).

```ts run
check('<img src="cat.jpg"><button><svg></svg></button><a href="/skip" aria-hidden="true">Skip</a>', { a11y });
```

Quiet when unsure: `alt=""`, `role="presentation"`, `hidden` and custom elements all silence the rule around them.

```ts run
check('<img src="c.jpg" alt=""><div hidden><button></button></div><label>Email <my-input></my-input></label>', { a11y });
```

`without()` turns a rule off for a whole codebase. The names are typed, so a typo is a type error.

```ts run
check('<img src="photo-3.png" alt="photo-3.png">', { a11y: without('img-alt-filename') });
```
