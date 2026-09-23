# Types

Every export is typed in its `.d.ts`; this is the shape of the ones most likely to be written out.

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

What a rule reports, mixed into the same list as `Problem` by
[`check()`](/api/check). Names, not numbers: these are not
[`HtmlError` codes](/reference/errors), and nothing here ever throws. Tell the two apart with
`'rule' in p`. From `@itsy/html/check`.

`A11yRule` is the union of the twenty-five names the built-in accessibility rules can report.
`check(markup)` returns `Finding<A11yRule>`, so a comparison against a name that does not exist is
a type error rather than a test that never matches, and `a11y: { without: [...] }` checks its
entries the same way. That object is `A11yOptions`, also from `@itsy/html/check`.

## `RuleSet`, `Visitor`, `Report`

```ts
type RuleSet = (report: Report) => Visitor;
type Report = (rule: string, message: string, at: number) => void;

interface Visitor {
  open?: (tag: string, attrs: ReadonlyMap<string, string>, at: number, ancestors: readonly string[]) => void;
  text?: (content: string, at: number, ancestors: readonly string[]) => void;
  close?: (tag: string, at: number, hadText: boolean) => void;
  end?: (ids: ReadonlyMap<string, number>) => void;
}
```

A project's own rules, for `check()`'s [`rules`](/api/check#custom-rules) option. Every hook is
optional. From `@itsy/html/check`.

Passing custom rules widens the result to `Finding<string>`, since this cannot know their names.

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
