import * as create from '@itsy/html/create';
import * as root from '@itsy/html';
import { attrsOf, clean, few, hostile, items, nav, one } from '../fixtures.js';

/**
 * The clean cases' templates, written once over a tag, so `html` and `trusted` render the same
 * code. The shared cases below keep their own templates, written as in every other renderer.
 */
const views = (h) => {
  const Link = (i) => h`<a href="${i.href}" class="link ${i.featured && 'is-featured'}">${i.name}</a>`;

  const Row = (i) =>
    h`<tr><td>${i.id}</td><td>${Link(i)}</td><td>${i.price.toFixed(2)}</td><td>${i.featured ? 'yes' : 'no'}</td></tr>`;

  const Group = (g) =>
    h`<section><h2>${g.title}</h2><ul>${g.links.map((l) => h`<li>${Link(l)}</li>`)}</ul></section>`;

  return {
    Link,
    Card: (i) =>
      h`<article class="card ${i.featured && 'is-featured'}" data-id="${i.id}" title="${i.name}"><h3>${i.name}</h3><p>${i.price.toFixed(2)}</p></article>`,
    Page: (n, f) => h`<main><h1>Catalogue</h1>${n.map(Group)}<ol>${f.map((i) => h`<li>${Link(i)}</li>`)}</ol></main>`,
    Table: (rows) => h`<table><tbody>${rows.map(Row)}</tbody></table>`,
    Text: (s) => h`<p>${s}</p>`,
  };
};

// The clean cases, over whichever tag `v` was written with.
const cleanCases = (v) => ({
  cleanLink: () => String(v.Link(clean().one)),
  cleanCard: () => String(v.Card(clean().one)),
  cleanPage: () => String(v.Page(clean().nav, clean().few)),
  cleanTable: () => String(v.Table(clean().items)),
  cleanText: () => String(v.Text(clean().text)),
});

/**
 * A factory, so ab.js can bind a second, older build of the library to the same
 * templates and time the two side by side in one process.
 *
 * Each build needs its own call. An `Html` from one build is not `instanceof` the
 * other's, so a value that crossed between them would be escaped instead of passed
 * through, silently and only in the nested cases. Keeping every template inside one
 * `make()` closure makes that impossible, not merely unlikely.
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
    ...cleanCases(views(html)),
    // The point of attrs(): the names come from an object at render time, not from the
    // template. Only the libraries that can do that themselves are in this case; see
    // ATTR_CASES in harness.js.
    attrs: () =>
      String(html`<ul>${few.map((i) => html`<li><a ${attrs(attrsOf(i))}>${i.name}</a></li>`)}</ul>`),
    // Every renderer here caches its template analysis on the strings array. A fresh
    // tag has an empty cache, so this measures the one-off scan of a call site.
    cold: () => {
      const { html: h } = createHtml({});
      return String(h`<a href="${one.href}" class="link ${one.featured && 'is-featured'}">${one.name}</a>`);
    },

    // Only ab.js runs these, and only because both sides are @itsy/html anyway.
    //
    // The `attrs` case above must stay byte-identical to preact, so it cannot use cx()'s
    // array form or any URL the guard would rewrite. These cover those paths, so a change
    // to one of them stays visible. They compare against nothing; they exist to make a
    // diff measurable.
    probes: {
      'attrs: booleans + tri-state': () => String(attrs({ disabled: true, hidden: false, draggable: true })),
      'attrs: cx() array class': () =>
        String(attrs({ class: ['btn', null, ['lg', { 'is-active': true, 'is-busy': false }]] })),
      'attrs: URL guard blocking': () => String(attrs({ href: 'javascript:alert(1)' })),
      'attrs: aria group': () => String(attrs({ aria: { expanded: true, controls: 'menu', label: one.name } })),
    },
  };
};

/** The same templates through `trusted`, which is only for the clean cases. A factory for ab.js, like `make`. */
export const makeTrusted = ({ trusted }) => ({ name: '@itsy/html trusted', ...cleanCases(views(trusted)) });

export default make({ html: root.html, attrs: root.attrs, createHtml: create.createHtml });
export const trusted = makeTrusted({ trusted: root.trusted });
