# Getting started

::: code-group

```sh [pnpm]
pnpm add @itsy/html
```

```sh [npm]
npm i @itsy/html
```

```sh [yarn]
yarn add @itsy/html
```

```sh [bun]
bun add @itsy/html
```

:::

Isometric, ESM-only, no dependencies, ships ES2022 syntax.

## A component

A component is a function that returns a template.

```ts run
import { html, attrs, Renderable } from '@itsy/html';

interface CardProps { title: string; flat: boolean, slot: Renderable }

const Card = ({ title, flat, slot }: CardProps) => html`
  <div ${attrs({ class: [{ flat }, 'card'] })}>
    <h1>${title}</h1>
    ${slot}
  </div>`;

Card({ title: 'Hello', flat: true, slot: html`<h2>World</h2>` });
```

## Rendering it

`Html` extends `String`, so anything that takes a string accepts it.

```ts
el.innerHTML = String(Card(props)); // browser
response.body = String(Card(props)); // server
```

## Available builds

A development and production build are included. The development build has more explicit errors, and has a markup checker that can be shaken out from production.

The production build will still throw the same errors as development, but will just include the error code.

Bundlers pick between builds with the `development` export condition.

::: code-group

```txt [Vite]
Nothing to do. Vite sets the development condition in dev
and drops it in a production build.
```

```sh [esbuild]
esbuild app.ts --bundle --conditions=development
```

```sh [Node]
node --conditions=development app.js
```

:::
