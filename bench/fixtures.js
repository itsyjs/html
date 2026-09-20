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
