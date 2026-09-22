# AGENTS.md — `@itsy/html` for coding agents

Tagged-template HTML renderer that returns escaped strings. ESM-only, zero deps,
isomorphic, **synchronous**. Every export is documented in its `.d.ts` — read
those for exact types. This file is the task-oriented map.

## Import map

| import path         | exports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@itsy/html`        | `html`, `attrs`, `cx`, `raw`, `Html`, `isHtml`, `HtmlError`; types `Renderable`, `AttrValue`, `AttrGroup`, `ClassValue`, `StyleValue`                                                                                                                                                                                                                                                                                                                                                                              |
| `@itsy/html/attrs`  | `attrs`, `cx`, `esc` — standalone, without the template scanner                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `@itsy/html/check`  | `check(markup, { ids?, a11y?, rules? })` → `(Problem \| Finding)[]` — the output validator, plus twenty-three accessibility rules that run **by default**. `a11y: false` turns them off; `a11y: { without: [...] }` turns some off by name, checked against `A11yRule`. `rules` takes your own `RuleSet`s, run in the same pass. `check.enabled` is `false` in the prod build, where `check()` returns `[]`. Types `Problem`, `Finding`, `RuleSet`, `Visitor`, `Report`, `A11yRule`, `A11yOptions`, `CheckOptions` |
| `@itsy/html/frame`  | `frame(options)` → the whole document; `head(parts, { nonce? })` → merged head fragment; `element(entry, nonce?)` → one element. Types `FrameOptions`, `HeadEntry`, `FramePart`                                                                                                                                                                                                                                                                                                                                    |
| `@itsy/html/util`   | `join(items, joiner)`, `map(items, f)`, `range(end)` / `range(start, end, step)`, `when(cond, trueFn, falseFn?)`, `choose(value, cases, fallback?)`, `wrap(items, tag, attrs?)`, `comment(text)`. Opt-in, one export each, tree-shakable. All return arrays or the thunk result and render nothing, except `comment`, which returns `Html`                                                                                                                                                                         |
| `@itsy/html/create` | `createHtml({ schemes?, collapse? })` → `{ html, attrs }` with their own URL guard, whitespace rule and template cache; `SCHEMES`, the default set, to spread. Type `CreateOptions`                                                                                                                                                                                                                                                                                                                                |

## Core usage

```ts
import { html, attrs, raw } from '@itsy/html';
import { join, wrap } from '@itsy/html/util';

html`<a href="${url}" class="lenke ${active && 'aktiv'}">${label}</a>`; // → Html (a wrapper: `.markup` or `String()` gives the string)
html`<ul>${items.map((i) => html`<li>${i.name}</li>`)}</ul>`; // arrays / iterables flatten
html`<input ${attrs({ type: 'text', disabled: busy, class: ['a', cond && 'b'] })}>`; // dynamic attributes
html`<button ${attrs({ aria: { expanded: open, controls: id }, data: { kategori } })}>`; // aria-expanded="false" data-kategori="…"
html`<section>${children}${footer && html`<footer>${footer}</footer>`}</section>`; // slots are params; a function is a thunk, built only if rendered
html`<script>${raw(JSON.stringify(state).replace(/</g, '\\u003c'))}</script>`; // the only way into <script>; escape < yourself or use devalue
html`<p>${join(tags.map(Tag), ', ')}</p>`; // util: joiner between items; the template escapes it
html`<ul>${wrap(names, 'li', { class: 'x' })}</ul>`; // util: each item in a tag; bad tag name is code 17
raw(trustedMarkup); // the one escape hatch
String(view) / el.innerHTML = view / res.send(String(view)); // Html coerces everywhere
```

## Rules the scanner enforces (once per call site; violations throw `HtmlError` at first render)

- Text and quoted attribute values: escaped. An expression may sit anywhere inside the quotes.
- URL attributes (`href src action formaction data xlink:href`): escaped **and** scheme-checked.
  Relative always passes; default schemes `http https mailto tel data blob`; anything else → `about:blank#blocked` (never throws; `check()` reports it as 19). `@itsy/html/create` gives an `html` and `attrs` with their own scheme list; a one-off link can be a whole tag in `raw()`.
  `Html` (a nested template, `raw()`) is not escaped again but is scheme-checked all the same. `srcset` is escaped only, never checked.
- `on*`: refused when the template is scanned, whatever the value (`null` and `Html` included). Unquoted attribute values: refused.
- Inside a tag: only `attrs()`/`raw()`. Inside `<script>`/`<style>`: only `raw()`. Inside `<!-- -->`: only `raw()`. A list of those is fine.
- Values: `string` escaped; `number`/`bigint` as digits; `true false null undefined` → nothing; iterables flatten; a function is called and its result rendered in place; objects/promises throw (and fail typecheck).
- `attrs()`: `false`/nullish omit, `true` is a bare name — except `aria-*`, `draggable`, `spellcheck`, `contenteditable`, where booleans render `"true"`/`"false"`. `aria: {…}` / `data: {…}` spread to `aria-key` / `data-key`, keys as written. Names are written out as given, unchecked.
- Dev build only, once per call site: the markup audit throws codes 8–14 — tag never closed with `>`, element still open at the end, end tag closing nothing/the wrong element, `<x />` on a non-void element, end tag on a void element, nesting the parser rewrites (`<a>` in `<a>`, `<div>` in `<p>`, `<tr>` in `<table>`), duplicate attribute. Every non-void element must be closed explicitly; the spec's omittable end tags (`<li>`, `<p>`, `<td>`…) are reported as 9/10. Deliberately unmatched tags go in `raw()`.
- `check(view)` from `@itsy/html/check` runs the audit over a rendered string (cross-template) and adds 15 (dangling id reference), 16 (duplicate id) and 19 (a URL the guard blocked, `about:blank#blocked`). It also runs the accessibility rules, which report a `rule` name instead of a numeric `code` — narrow with `'rule' in p`. Returns a list; never throws. A project's own rules go in `rules`: a `RuleSet` is `(report) => Visitor`, where `Visitor` is `{ open?, text?, close?, end? }` and every hook is optional.
- `frame({ lang, title, description?, head, header, content, footer, scripts, nonce, main?, attrs? })`: charset → viewport → title → description → head entries. The head is keyed (title/base/charset single; meta by name/property/http-equiv; link by rel+href; icons by type+sizes; canonical/manifest single; script by src; `key` overrides): later wins, in the earlier position. `content` sits in `<main id="maincontent" tabindex="-1">` unless `main: false`. Script/style entries get `nonce`; their body must be `Html` (code 6); a function body is called; a body on a void element is code 18. Bad tag name is code 17.
- Every `HtmlError` has a stable `code` (1–19, listed at https://itsyjs.github.io/html/reference/errors; 1 and 4 are reserved). The prod build's message is `E<code>`; the dev build (`development` export condition — Vite sets it in dev, esbuild/Node need `--conditions=development`) spells it out. Output is identical in both.

## Gotchas

- `${flag}` renders nothing; `<input ${flag}>` is an error — write `attrs({ disabled: flag })`.
- A template that is only `<div>` throws 9 in dev, and one that is only `<my-el />` throws 11: fragments must balance, and only void elements self-close. `raw('<div>')` is the deliberate-fragment hatch.
- `src/audit.ts` and `src/a11y.ts` are dev-only and tree-shaken out of prod. `src/audit.ts` never influences escaping; it only adds errors, so don't fold it into the scanner in `html.ts`. `src/a11y.ts` is reached only from `check()`'s `__DEV__` branch, and `test/built/output.test.ts` scans the prod bundles to prove it never arrives there.
- `attrs({ 'aria-expanded': open })` renders `aria-expanded="false"` when closed; `attrs({ 'data-open': open })` renders nothing. Different attributes, different rules, on purpose.
- Building: `tsdown` runs two configs (`dist/index.js` with `__DEV__=false`, `dist/index.dev.js` with `__DEV__=true`). Any `throw new HtmlError(code, __DEV__ && `…`)` keeps its prose out of prod.
- Testing: `pnpm test` runs the unbundled source with `--import ./test/setup.ts`, which defines `__DEV__ = true`; it needs no build. The tests that assert against `dist/` live in `test/built/` and run from `postbuild`, so `pnpm build` verifies its own output and `pnpm check` picks them up through `check:build`. They throw rather than skip when `dist/` is missing — a skip there reports success having tested nothing.
- Do not build markup by concatenation and `raw()` it. Put the expression in the template; escaping depends on the context.
- `createHtml(opts)` from `@itsy/html/create` returns an isolated `{ html, attrs }` with its own cache and schemes. Create at module scope, once per page; `frame` and `wrap()` keep the defaults.
- Templates are cached by their `TemplateStringsArray` — never fabricate one; always write the literal.
- Static whitespace containing a newline becomes one space, never nothing (dropped at the template's own two edges; not in `<pre>`/`<textarea>`).
- Formatters: set `"embeddedLanguageFormatting": "off"` (Prettier/oxfmt) or they rewrite the markup inside `html\`…\``.

## Non-goals

No DOM, no hydration, no diffing, no async values, no HTML validation, no i18n.
