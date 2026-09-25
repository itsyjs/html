// One dataset, shared by every renderer, so each case does the same amount of work.

/** A product list. Names hold `&` and `"`; hrefs hold `&`. Ordinary data that still needs escaping. */
export const items = Array.from({ length: 1000 }, (_, i) => ({
  id: i,
  name: `Widget ${i} & "co"`,
  href: `/items/${i}?ref=list&page=1`,
  price: ((i * 7) % 499) + 0.99,
  featured: i % 7 === 0,
}));

/** The first ten, for the cases that measure per-call overhead rather than volume. */
export const few = items.slice(0, 10);

/** One item, for the single-element case. */
export const one = items[0];

/** Worst case for an escaper: every character is one it has to replace. */
export const hostile = '<script>alert("xss") & \'more\'</script>'.repeat(20);

/** A page's worth of navigation. */
export const nav = [
  { title: 'Catalogue', links: few.slice(0, 5) },
  { title: 'Offers', links: few.slice(5, 10) },
];

/**
 * The same shapes with nothing to escape, for the clean cases: names without `&` or `"`, links
 * without `&`, and plain text as long as `hostile`. `trusted` only takes data like this.
 *
 * Built on first use, so only the processes that run the clean cases hold it. Allocating these
 * products at import, in a process that never rendered them, moved @itsy/html's escape-heavy
 * case from 2.43 µs to 1.92 µs. A thousand unrelated arrays did not, and neither did the text.
 */
let built;
export const clean = () => (built ??= cleanData());
const cleanData = () => {
  const items = Array.from({ length: 1000 }, (_, i) => ({
    id: i,
    name: `Widget ${i}`,
    href: `/items/${i}?page=1`,
    price: ((i * 7) % 499) + 0.99,
    featured: i % 7 === 0,
  }));
  const few = items.slice(0, 10);
  return {
    items,
    few,
    one: items[0],
    nav: [
      { title: 'Catalogue', links: few.slice(0, 5) },
      { title: 'Offers', links: few.slice(5, 10) },
    ],
    text: 'Nothing in this line needs any escape '.repeat(20),
  };
};

/**
 * The attribute set for the `attrs` case: the object each renderer turns into attributes
 * with whatever mechanism it has.
 *
 * Chosen so @itsy/html, htm + preact and the hand-written baseline can agree byte for
 * byte. `class` is pre-joined, because preact renders an array as `class="a,b"`; no value
 * is the empty string, which preact would render as a bare attribute; no value holds `>`
 * or `'`, neither of which preact's escaper touches; and `href` is relative, so the URL
 * guard never rewrites it. `few` holds both featured and ordinary items, so the boolean
 * pair below is exercised each way: one of them is always written out, the other omitted.
 */
export const attrsOf = (i) => ({
  class: i.featured ? 'link is-featured' : 'link',
  'data-id': String(i.id),
  href: i.href,
  title: i.name,
  'aria-current': i.featured,
  hidden: !i.featured,
});
