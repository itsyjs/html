---
layout: home
hero:
  name: '@itsy/html'
  tagline: A tiny HTML renderer with just enough features.
  image:
    light: /hero-light.svg
    dark: /hero-dark.svg
    alt: A pixel-art spider, the @itsy/html mark
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Playground
      link: /playground
    - theme: alt
      text: GitHub
      link: https://github.com/itsyjs/html
features:
  - title: Security
    details: 'Text, attributes and URLs each get the right escaping. A javascript: URL renders as about:blank#blocked. If escaping cannot make a value safe, it throws.'
  - title: Focus on DX
    details: Components are easy to write with a rich attribute-helper. Syntax and basic correctness is checked in development-mode.
  - title: Isometric strings
    details: Everything runs on the client and server. The core module is less than 1.5kb gzip and has separate development and production builds.
---

## A complete example

```ts run
import { html, attrs } from '@itsy/html';

type Link = { href: string; label: string; active?: boolean };

const Link = ({ href, label, active = false }: Link) =>
  html`<a ${attrs({ href, class: ['link', { active }], aria: { current: active ? 'page' : null } })}>${label}</a>`;

const Menu = (title: string, links: Link[]) => html`
  <nav ${attrs({ aria: { label: title }, hidden: !links.length })}>
    <h2>${title}</h2>
    ${links.map(Link)}
  </nav>`;

Menu('Docs & more', [
  { href: '/guide', label: 'Guide', active: true },
  { href: 'javascript:alert(1)', label: '<script>' },
]);
```

[Start here](/guide/getting-started), or [try it in the browser](/playground).
