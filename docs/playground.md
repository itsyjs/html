---
title: Playground
---

# Playground

Everything below runs in this page. The library is synchronous and has no dependencies, so the same
code that renders on a server renders here.

<ClientOnly>
  <Playground />
</ClientOnly>

## What to try

- Put `<` or `&` in a piece of text and watch it come back escaped.
- Change a `javascript:` URL to `https:` and back. It is never an error, only a replacement.
- Delete a closing tag and see which error code comes back, and what the message says the browser would do.
- Give two elements the same id. The template check says nothing; `check()` finds it, because only a
  finished page can know.
- Swap `aria-pressed` for `data-pressed` and set it to `false`. One renders, one disappears —
  see [attributes](/guide/writing-html#attributes).
- Write a `<style>` block and style the markup. The preview renders in a shadow root, so it
  starts from the browser's own stylesheet rather than this site's, and nothing written there can
  reach the rest of this page.
