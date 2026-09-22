import * as create from '@itsy/html/create';
import * as root from '@itsy/html';
import { attrsOf, few, hostile, items, nav, one } from '../fixtures.js';

/**
 * Built as a factory so ab.js can bind a second, older build of the library to the same
 * templates and time the two side by side in one process.
 *
 * Each build must get its own call. An `Html` from one build is not `instanceof` the
 * other's, so a value that crossed between them would be escaped rather than passed
 * through — silently, and only in the nested cases. Keeping every template inside one
 * `make()` closure is what makes that impossible rather than merely unlikely.
 */
export const make = ({ html, attrs, createHtml }) => {
  const Link = (i) => html`<a href="${i.href}" class="link ${i.featured && 'is-featured'}">${i.name}</a>`;

  const Row = (i) =>
    html`<tr><td>${i.id}</td><td>${Link(i)}</td><td>${i.price.toFixed(2)}</td><td>${i.featured ? 'yes' : 'no'}</td></tr>`;

  const Group = (g) =>
    html`<section><h2>${g.title}</h2><ul>${g.links.map((l) => html`<li>${Link(l)}</li>`)}</ul></section>`;

  return {
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
    // The whole point of attrs(): the names are not in the template, they come from an
    // object at render time. Only the libraries that can do that themselves are in this
    // case; see ATTR_CASES in harness.js.
    attrs: () =>
      String(html`<ul>${few.map((i) => html`<li><a ${attrs(attrsOf(i))}>${i.name}</a></li>`)}</ul>`),
    // Every renderer here caches its template analysis on the strings array. A fresh
    // tag has an empty cache, so this measures the one-off scan of a call site.
    cold: () => {
      const { html: h } = createHtml({});
      return String(h`<a href="${one.href}" class="link ${one.featured && 'is-featured'}">${one.name}</a>`);
    },

    // Only ab.js runs these, and only because it is @itsy/html on both sides anyway.
    //
    // The `attrs` case above has to stay byte-identical to preact, which costs it cx()'s
    // array form and any URL the guard would rewrite. These cover what that leaves out, so
    // a change to one of those paths is not invisible. They are not a comparison with
    // anything — they exist to make a diff measurable.
    probes: {
      'attrs: booleans + tri-state': () => String(attrs({ disabled: true, hidden: false, draggable: true })),
      'attrs: cx() array class': () =>
        String(attrs({ class: ['btn', null, ['lg', { 'is-active': true, 'is-busy': false }]] })),
      'attrs: URL guard blocking': () => String(attrs({ href: 'javascript:alert(1)' })),
      'attrs: aria group': () => String(attrs({ aria: { expanded: true, controls: 'menu', label: one.name } })),
    },
  };
};

export default make({ html: root.html, attrs: root.attrs, createHtml: create.createHtml });
