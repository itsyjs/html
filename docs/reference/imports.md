# Import map

Six entry points. Each is its own module, so a bundler keeps only what you import.

| import                             | exports                                                     |
| ---------------------------------- | ----------------------------------------------------------- |
| `@itsy/html`                       | `html`, `attrs`, `cx`, `raw`, `Html`, `isHtml`, `HtmlError` |
| [`@itsy/html/attrs`](/api/attrs)   | `attrs`, `cx`, `esc` — no template scanner                  |
| [`@itsy/html/check`](/api/check)   | `check` — the markup and accessibility checks               |
| [`@itsy/html/frame`](/api/frame)   | `frame`, `head`, `element`                                  |
| [`@itsy/html/util`](/api/util)     | `join`, `map`, `range`, `when`, `choose`, `wrap`, `comment` |
| [`@itsy/html/create`](/api/create) | `createHtml`, `SCHEMES`                                     |

`@itsy/html/frame` includes the renderer, so a page that uses `frame()` does not need to import
`@itsy/html` separately. `@itsy/html/util` has no shared state between its helpers, so importing
`join` does not pull in the other six.

Types come from the entry point they belong to: `Renderable` and the `attrs()` types from the root,
`Problem`, `Finding`, `RuleSet`, `Visitor`, `Report`, `A11yRule`, `A11yOptions` and `CheckOptions`
from `/check`, `FrameOptions`, `HeadEntry` and `FramePart` from `/frame`, `CreateOptions` from
`/create`. They are listed in [types](/reference/types).

## Two builds per entry

`package.json` declares a `development` export condition for all six. Bundlers that honour it —
Vite does, automatically — get the development build during development and the production build in
a production build. Node and esbuild need `--conditions=development`. See
[bundlers and editors](/recipes/tooling).

Both builds render identical output and throw the same `HtmlError.code`. Only the message text and
the markup check differ: the development build spells the message out and checks your markup, and
the production build throws `E` followed by the code.
