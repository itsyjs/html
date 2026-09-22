import { attrsOf, few, hostile, items, nav, one } from '../fixtures.js';

// Two reference points, not libraries.
//
// `escaped` is what you would write by hand: the same escaping, no scanner, no
// context, no URL guard. It is the fastest a correct hand-rolled renderer gets.
// `raw` skips escaping entirely — the speed of light, and a hole in your site.

// The same scan-and-slice escaper @itsy/html and hono use. A `replace` with a
// callback is what most people write by hand and is roughly half the speed, but
// this row is meant to be the floor for a correct renderer, not a typical one.
const FIRST = /[&<>"']/;
const esc = (s) => {
  let at = s.search(FIRST);
  if (at === -1) return s;
  let out = '';
  let last = 0;
  for (; at < s.length; at++) {
    let e;
    switch (s.charCodeAt(at)) {
      case 38: e = '&amp;'; break;
      case 60: e = '&lt;'; break;
      case 62: e = '&gt;'; break;
      case 34: e = '&quot;'; break;
      case 39: e = '&#39;'; break;
      default: continue;
    }
    out += s.slice(last, at) + e;
    last = at + 1;
  }
  return out + s.slice(last);
};

// Attributes from an object, written by hand: no scanner, no URL guard, and the tri-state
// rule spelled out rather than derived from a set. This is the floor the `attrs` case is
// measured against — the only helper in this file that @itsy/html's attrs() has to beat.
//
// It handles exactly what attrsOf() produces, not the general rule: `aria-*` only, where
// attrs() also treats draggable, spellcheck and contenteditable as tri-state. Widen the
// fixture and this needs widening with it, which verify() will say so loudly.
const TRI = /^aria-/;
const buildAttrs = (o) => {
  let out = '';
  for (const k in o) {
    const v = o[k];
    if (v == null) continue;
    if (typeof v === 'boolean') {
      if (TRI.test(k)) out += ` ${k}="${v}"`; // aria-* writes "false" out; absent means something else
      else if (v) out += ` ${k}`; // a bare attribute, or nothing at all
    } else out += ` ${k}="${esc(String(v))}"`;
  }
  return out;
};

const Link = (i) => `<a href="${esc(i.href)}" class="link ${i.featured ? 'is-featured' : ''}">${esc(i.name)}</a>`;

const Row = (i) =>
  `<tr><td>${i.id}</td><td>${Link(i)}</td><td>${i.price.toFixed(2)}</td><td>${i.featured ? 'yes' : 'no'}</td></tr>`;

const Group = (g) =>
  `<section><h2>${esc(g.title)}</h2><ul>${g.links.map((l) => `<li>${Link(l)}</li>`).join('')}</ul></section>`;

export const escaped = {
  name: 'hand-written (escape + concat)',
  link: () => Link(one),
  card: () =>
    `<article class="card ${one.featured ? 'is-featured' : ''}" data-id="${one.id}" title="${esc(one.name)}"><h3>${esc(one.name)}</h3><p>${one.price.toFixed(2)}</p></article>`,
  table: () => `<table><tbody>${items.map(Row).join('')}</tbody></table>`,
  escape: () => `<p>${esc(hostile)}</p>`,
  page: () =>
    `<main><h1>Catalogue</h1>${nav.map(Group).join('')}<ol>${few.map((i) => `<li>${Link(i)}</li>`).join('')}</ol></main>`,
  attrs: () => `<ul>${few.map((i) => `<li><a${buildAttrs(attrsOf(i))}>${esc(i.name)}</a></li>`).join('')}</ul>`,
};

const RawLink = (i) => `<a href="${i.href}" class="link ${i.featured ? 'is-featured' : ''}">${i.name}</a>`;
const RawRow = (i) =>
  `<tr><td>${i.id}</td><td>${RawLink(i)}</td><td>${i.price.toFixed(2)}</td><td>${i.featured ? 'yes' : 'no'}</td></tr>`;
const RawGroup = (g) =>
  `<section><h2>${g.title}</h2><ul>${g.links.map((l) => `<li>${RawLink(l)}</li>`).join('')}</ul></section>`;

export const raw = {
  name: 'no escaping (speed of light)',
  unsafe: true, // the point of this one: it is here to show what escaping costs
  link: () => RawLink(one),
  card: () =>
    `<article class="card ${one.featured ? 'is-featured' : ''}" data-id="${one.id}" title="${one.name}"><h3>${one.name}</h3><p>${one.price.toFixed(2)}</p></article>`,
  table: () => `<table><tbody>${items.map(RawRow).join('')}</tbody></table>`,
  escape: () => `<p>${hostile}</p>`,
  page: () =>
    `<main><h1>Catalogue</h1>${nav.map(RawGroup).join('')}<ol>${few.map((i) => `<li>${RawLink(i)}</li>`).join('')}</ol></main>`,
};
