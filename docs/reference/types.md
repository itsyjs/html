# Types

Every export is typed in its `.d.ts`; this is the shape of the ones you are likely to write out.

## `Renderable`

```ts
type Renderable =
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | Html
  | Iterable<Renderable>
  | (() => Renderable);
```

What a template accepts, and therefore the type to give a [slot](/guide/writing-html#slots). Objects and
promises are absent deliberately, so `${user}` is a type error rather than `[object Object]`, and
an un-awaited promise fails to compile rather than rendering as nothing.

From `@itsy/html`.

## `AttrValue`

```ts
type AttrValue =
  | string | number | bigint | boolean | null | undefined
  | ClassValue[] // class
  | StyleValue // style
  | AttrGroup; // aria, data
```

A value for [`attrs()`](/api/attrs). `true` gives a bare attribute, `false` and nullish leave it
out — except for `aria-*`, `draggable`, `spellcheck` and `contenteditable`, where booleans render
`"true"` and `"false"`.

## `ClassValue`

```ts
type ClassValue =
  | string | number | bigint | boolean | null | undefined
  | ClassValue[]
  | Record<string, unknown>;
```

What [`cx()`](/api/attrs#cx) takes, and what the `class` key in `attrs()` takes. Arrays nest,
objects contribute the keys whose value is truthy, and falsy values are skipped.

## `StyleValue`

```ts
type StyleValue = Record<string, string | number | null | undefined | false>;
```

A `style` attribute as an object. Keys are written out exactly as given — `--brand`,
`background-color` — with no camelCase conversion. `null`, `undefined` and `false` drop the
declaration.

## `AttrGroup`

```ts
type AttrGroup = Record<string, string | number | bigint | boolean | null | undefined>;
```

The object form of `aria` and `data`, so `aria: { expanded: open }` becomes `aria-expanded="…"`.

## `Problem`

```ts
interface Problem {
  code: number;
  message: string;
  at: number;
  near: string;
}
```

What [`check()`](/api/check) returns, one per problem, in page order. `at` is a character offset;
in a template a `${…}` counts as those four characters. From `@itsy/html/check`, along with
`CheckOptions`.

## `Finding`

```ts
interface Finding<R extends string = string> {
  rule: R;
  message: string;
  at: number;
  near: string;
}
```

What the [accessibility rules](/api/a11y) report, mixed into the same list as `Problem` when you
pass `a11y` to [`check()`](/api/check). Names, not numbers: these are not
[`HtmlError` codes](/reference/errors), and nothing here ever throws. Tell the two apart with
`'rule' in p`. From `@itsy/html/check`.

`A11yRule`, from `@itsy/html/a11y`, is the union of the nineteen names the rules can report.
`check(markup, { a11y })` returns `Finding<A11yRule>`, so a comparison against a name that does not
exist is a type error rather than a test that never matches, and `without()` checks its arguments
the same way. `RuleSet` is the type of `check()`'s `a11y` option; its shape is not public API, so
write your own at your own risk.

## `FrameOptions`, `HeadEntry`, `FramePart`

From `@itsy/html/frame`; the fields are listed in [the frame API](/api/frame). `FramePart` is
`HeadEntry | Html`, which is what `head` and `scripts` accept.

## `CreateOptions`

```ts
interface CreateOptions {
  schemes?: Iterable<string>;
  collapse?: boolean;
}
```

From [`@itsy/html/create`](/api/create).
