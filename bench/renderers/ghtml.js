import { html } from 'ghtml';
import { few, hostile, items, nav, one } from '../fixtures.js';

// ghtml escapes every `${…}` and leaves `!${…}` alone, so nested markup and lists take `!`.
const Link = (i) => html`<a href="${i.href}" class="link ${i.featured ? 'is-featured' : ''}">${i.name}</a>`;

const Row = (i) =>
  html`<tr><td>${i.id}</td><td>!${Link(i)}</td><td>${i.price.toFixed(2)}</td><td>${i.featured ? 'yes' : 'no'}</td></tr>`;

const Group = (g) =>
  html`<section><h2>${g.title}</h2><ul>!${g.links.map((l) => html`<li>!${Link(l)}</li>`)}</ul></section>`;

export default {
  name: 'ghtml',
  link: () => String(Link(one)),
  card: () =>
    String(
      html`<article class="card ${one.featured ? 'is-featured' : ''}" data-id="${one.id}" title="${one.name}"><h3>${one.name}</h3><p>${one.price.toFixed(2)}</p></article>`,
    ),
  table: () => String(html`<table><tbody>!${items.map(Row)}</tbody></table>`),
  escape: () => String(html`<p>${hostile}</p>`),
  page: () =>
    String(
      html`<main><h1>Catalogue</h1>!${nav.map(Group)}<ol>!${few.map((i) => html`<li>!${Link(i)}</li>`)}</ol></main>`,
    ),
};
