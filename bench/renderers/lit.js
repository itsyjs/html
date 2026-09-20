import '@lit-labs/ssr/lib/install-global-dom-shim.js';
import { render } from '@lit-labs/ssr';
import { html } from 'lit';
import { few, hostile, items, nav, one } from '../fixtures.js';

// `html` here only builds a TemplateResult; @lit-labs/ssr turns it into a string.
// Collecting that stream is part of the job, so it is inside the timed function.
const toString = (result) => {
  let out = '';
  for (const chunk of render(result)) out += chunk;
  return out;
};

const Link = (i) => html`<a href="${i.href}" class="link ${i.featured ? 'is-featured' : ''}">${i.name}</a>`;

const Row = (i) =>
  html`<tr><td>${i.id}</td><td>${Link(i)}</td><td>${i.price.toFixed(2)}</td><td>${i.featured ? 'yes' : 'no'}</td></tr>`;

const Group = (g) =>
  html`<section><h2>${g.title}</h2><ul>${g.links.map((l) => html`<li>${Link(l)}</li>`)}</ul></section>`;

export default {
  name: 'lit + @lit-labs/ssr',
  link: () => toString(Link(one)),
  card: () =>
    toString(
      html`<article class="card ${one.featured ? 'is-featured' : ''}" data-id="${one.id}" title="${one.name}"><h3>${one.name}</h3><p>${one.price.toFixed(2)}</p></article>`,
    ),
  table: () => toString(html`<table><tbody>${items.map(Row)}</tbody></table>`),
  escape: () => toString(html`<p>${hostile}</p>`),
  page: () =>
    toString(
      html`<main><h1>Catalogue</h1>${nav.map(Group)}<ol>${few.map((i) => html`<li>${Link(i)}</li>`)}</ol></main>`,
    ),
};
