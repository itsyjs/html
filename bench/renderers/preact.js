import htmFactory from 'htm';
import { h } from 'preact';
import { render } from 'preact-render-to-string';
import { attrsOf, few, hostile, items, nav, one } from '../fixtures.js';

// htm parses the template into preact vnodes; preact-render-to-string turns those into a string.
const html = htmFactory.bind(h);
const toString = (vnode) => render(vnode);

const Link = (i) => html`<a href="${i.href}" class="link ${i.featured ? 'is-featured' : ''}">${i.name}</a>`;

const Row = (i) =>
  html`<tr><td>${i.id}</td><td>${Link(i)}</td><td>${i.price.toFixed(2)}</td><td>${i.featured ? 'yes' : 'no'}</td></tr>`;

const Group = (g) =>
  html`<section><h2>${g.title}</h2><ul>${g.links.map((l) => html`<li>${Link(l)}</li>`)}</ul></section>`;

export default {
  name: 'htm + preact-render-to-string',
  // preact's encodeEntities escapes only `"`, `&` and `<`. The hostile fixture is full of
  // `>` and `'`, which it leaves alone, so this one case cannot match @itsy/html.
  differs: { escape: "preact escapes only \" & < — not > or '" },
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
  // `...${obj}` is htm's spread, compiled to an Object.assign onto the vnode's props —
  // preact's own mechanism, not one written here.
  attrs: () =>
    toString(html`<ul>${few.map((i) => html`<li><a ...${attrsOf(i)}>${i.name}</a></li>`)}</ul>`),
};
