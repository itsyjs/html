import { html } from '@itsy/html';
import { createHtml } from '@itsy/html/create';
import { few, hostile, items, nav, one } from '../fixtures.js';

const Link = (i) => html`<a href="${i.href}" class="link ${i.featured && 'is-featured'}">${i.name}</a>`;

const Row = (i) =>
  html`<tr><td>${i.id}</td><td>${Link(i)}</td><td>${i.price.toFixed(2)}</td><td>${i.featured ? 'yes' : 'no'}</td></tr>`;

const Group = (g) =>
  html`<section><h2>${g.title}</h2><ul>${g.links.map((l) => html`<li>${Link(l)}</li>`)}</ul></section>`;

export default {
  name: '@itsy/html',
  link: () => String(Link(one)),
  card: () =>
    String(
      html`<article class="card ${one.featured && 'is-featured'}" data-id="${one.id}" title="${one.name}"><h3>${one.name}</h3><p>${one.price.toFixed(2)}</p></article>`,
    ),
  table: () => String(html`<table><tbody>${items.map(Row)}</tbody></table>`),
  escape: () => String(html`<p>${hostile}</p>`),
  page: () =>
    String(html`<main><h1>Catalogue</h1>${nav.map(Group)}<ol>${few.map((i) => html`<li>${Link(i)}</li>`)}</ol></main>`),
  // Every renderer here caches its template analysis on the strings array. A fresh
  // tag has an empty cache, so this measures the one-off scan of a call site.
  cold: () => {
    const { html: h } = createHtml({});
    return String(h`<a href="${one.href}" class="link ${one.featured && 'is-featured'}">${one.name}</a>`);
  },
};
