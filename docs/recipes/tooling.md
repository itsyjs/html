# Bundlers and editors

## Choosing the development build

The dev build spells out error messages and runs [the markup check](/guide/checks). The
production build throws the same `HtmlError.code` with the message `E6` and skips the check.
Bundlers pick between them with the `development` export condition.

::: code-group

```txt [Vite]
Nothing to do. Vite sets the development condition during dev and
drops it for a production build, so you get the right one either way.
```

```js [esbuild]
// esbuild.config.js
await esbuild.build({
  entryPoints: ['src/app.ts'],
  bundle: true,
  conditions: dev ? ['development'] : [],
});
```

```sh [Node]
node --conditions=development server.js
```

```sh [node --test]
node --conditions=development --test test/*.test.ts
```

:::

::: warning
Without the condition you get the production build, where `check()` returns `[]` and every markup
mistake goes unreported. A test suite on the production build passes whatever you write. See
[testing](/recipes/testing#make-sure-you-are-on-the-dev-build).
:::

## Formatters rewrite your markup

Prettier and oxfmt both format embedded languages by default. Inside an `html` template that means
`<br>` becomes `<br />`, which the markup check then reports as
[code 11](/reference/errors#e11), and a `${}` inside `<script>` can pick up a stray `;`.

::: code-group

```json [.prettierrc]
{
  "embeddedLanguageFormatting": "off"
}
```

```ts [oxfmt.config.ts]
import { defineConfig } from 'oxfmt';

export default defineConfig({
  embeddedLanguageFormatting: 'off',
});
```

:::

## Syntax highlighting

Most editors highlight a tagged template by the name of its tag, and `html` is the name every
lit-html-aware tool already looks for — so highlighting usually works with no configuration.

Where it does not, a comment before the backtick is understood by most tooling and costs nothing at
runtime:

```ts
const view = /* html */ `<p>…</p>`;
```

For VS Code, the lit-html extension adds highlighting, bracket matching and folding inside `html`
templates. It does not need lit to be installed.

## TypeScript

Nothing to configure. `html` is typed as a tag over `Renderable`, so an object or a `Promise` in a
template is a type error before it is a runtime one, and `Html` has a private field that keeps a
plain string from passing as one.

The package is ESM only. `"module": "ESNext"` with `"moduleResolution": "bundler"` — or `"node16"`
and up — resolves the six entry points; anything older will not see them.
