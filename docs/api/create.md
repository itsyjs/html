# @itsy/html/create

```ts
import { createHtml, SCHEMES } from '@itsy/html/create';
import type { CreateOptions } from '@itsy/html/create';
```

A separate `html` and `attrs`, with a different URL scheme list or whitespace rule. The root exports
keep the defaults.

## createHtml

```ts
createHtml(options?: CreateOptions): { html: typeof html; attrs: typeof attrs }
```

```ts
export const { html, attrs } = createHtml({ schemes: [...SCHEMES, 'sms'] });
```

::: warning Call it once, at module scope
Each call has its own template cache. Calling `createHtml` inside a component re-scans every
template on every render. Create it once and export the result.
:::

## CreateOptions

```ts
interface CreateOptions {
  schemes?: Iterable<string>; // default SCHEMES
  collapse?: boolean; // default true
}
```

### schemes

The allowed URL schemes, lowercase. It **replaces** the default set rather than adding to it.

```ts
createHtml({ schemes: [...SCHEMES, 'sms'] }); // the defaults plus sms
createHtml({ schemes: ['https'] }); // https and nothing else
```

### collapse

`false` keeps line breaks and indentation in the static markup exactly as written, instead of
[collapsing them to single spaces](/guide/writing-html#whitespace).

```ts
createHtml({ collapse: false });
```

## SCHEMES

```ts
const SCHEMES: ReadonlySet<string>; // http, https, mailto, tel, data, blob
```

The default set, exported so it can be spread when needed.

::: warning
`frame` and `wrap()` always use `SCHEMES`. A scheme added here is still blocked in a frame head
entry or a `wrap()` attribute. For a single link, `raw()` on the whole tag is simpler — see [the URL
guard](/security/url-guard#adding-a-scheme).
:::
