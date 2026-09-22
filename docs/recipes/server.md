# On a server

The renderer returns one string, synchronously. There is nothing to await and no framework
integration to install — set the content type and send it.

::: code-group

```ts [Hono]
import { Hono } from 'hono';
import { frame } from '@itsy/html/frame';

const app = new Hono();

app.get('/orders', (c) => {
  const view = frame({ lang: 'en', title: 'Orders', content: Orders(data) });
  return c.html(String(view));
});
```

```ts [Fastify]
import Fastify from 'fastify';
import { frame } from '@itsy/html/frame';

const app = Fastify();

app.get('/orders', (_req, reply) => {
  const view = frame({ lang: 'en', title: 'Orders', content: Orders(data) });
  reply.type('text/html; charset=utf-8').send(String(view));
});
```

```ts [node:http]
import { createServer } from 'node:http';
import { frame } from '@itsy/html/frame';

createServer((_req, res) => {
  const view = frame({ lang: 'en', title: 'Orders', content: Orders(data) });
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(String(view));
}).listen(3000);
```

:::

::: warning Prefer using `String(view)`
`Html` is an object. Frameworks often serialize whatever is returned - so the `Html` object might be used instead of stringifying.

Plus it will make Typescript happy, and y'all love Typescript.
:::

## The page is one string

There is no streaming and no partial flush. `frame()` builds the whole document and hands it over.
For most pages that is the simpler trade: no suspense boundaries, no out-of-order chunks, and the
`Content-Length` is known.

If you need a shell sent before the data is ready, send two responses — a fast page and a fetch —
rather than trying to split a template.

## A nonce per request

`frame({ nonce })` adds the nonce to every script and style entry that has none of its own.

```ts
app.get('/orders', (c) => {
  const nonce = crypto.randomUUID();
  c.header('content-security-policy', `script-src 'nonce-${nonce}'; object-src 'none'`);
  return c.html(String(frame({ lang: 'en', title: 'Orders', content, scripts, nonce })));
});
```

The library never writes an inline event handler, so a policy with no `unsafe-inline` for scripts
works as-is. See [what it does not do](/security/limits#content-security-policy).

## Check the output in development

```ts
import { check } from '@itsy/html/check';

if (process.env.NODE_ENV !== 'production') {
  for (const p of check(view)) console.warn(`[${'rule' in p ? p.rule : `html ${p.code}`}] ${p.message}`, p.near);
}
```

In the production build `check()` returns `[]`, so the guard above is about skipping the loop, not
about safety. Leaving the call in unguarded is fine.
