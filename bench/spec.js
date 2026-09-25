// Pure data: the cases and where each renderer lives. Importing this must not import any
// renderer. That is why it is a separate file.
//
// table.js measures each renderer in its own process, and that process should hold that
// renderer and nothing else. Loading six other template libraries alongside it is not neutral:
// renderers/lit.js installs a global DOM shim on import, and @itsy/html once declared a String
// subclass that slowed every other library in the process by up to 2.8x.

/** The cases every renderer implements, and the label each carries wherever it is printed. */
export const CASES = {
  link: 'one <a>',
  card: 'one element',
  page: 'nested page',
  table: '1000 rows',
  escape: 'escape-heavy',
};
export const CASE_KEYS = Object.keys(CASES);

/**
 * Building attributes from an object, which only some of these libraries can do.
 *
 * Kept out of `CASES` on purpose: that list feeds the relative-speed table, which needs every
 * renderer to implement every key. lit is absent because @lit-labs/ssr cannot render an element
 * part at all. hono and ghtml are absent because neither has any attribute mechanism: an object
 * interpolates as `[object Object]`. The only route is building the string by hand, which would
 * time the bench's own builder rather than the library. See README.
 */
export const ATTR_CASES = { attrs: 'attributes from an object' };
export const ATTR_KEYS = Object.keys(ATTR_CASES);

/**
 * The shared cases again, over data with nothing to escape (`clean` in fixtures.js), with plain
 * text in place of the escape-heavy string.
 *
 * Kept apart for `trusted`. It is only for data like this, since its development build throws on
 * anything `html` would escape. On the shared data it would be a second no-escaping row. So it
 * gets its own table, beside `html` and the two reference points, and all four must write the
 * same bytes. That also proves the data needed no escaping.
 */
export const CLEAN_CASES = {
  cleanLink: 'one <a>',
  cleanCard: 'one element',
  cleanPage: 'nested page',
  cleanTable: '1000 rows',
  cleanText: 'plain text',
};
export const CLEAN_KEYS = Object.keys(CLEAN_CASES);

/**
 * Every contender, in table order: display name, module, and the export to take from it.
 * `shared: false` marks one that skips `CASES`.
 */
export const RENDERERS = [
  { name: '@itsy/html', module: './renderers/itsy.js', export: 'default' },
  { name: '@itsy/html trusted', module: './renderers/itsy.js', export: 'trusted', shared: false },
  { name: 'hono/html', module: './renderers/hono.js', export: 'default' },
  { name: 'ghtml', module: './renderers/ghtml.js', export: 'default' },
  { name: 'htm + preact-render-to-string', module: './renderers/preact.js', export: 'default' },
  { name: 'lit + @lit-labs/ssr', module: './renderers/lit.js', export: 'default' },
  { name: 'hand-written (escape + concat)', module: './renderers/baseline.js', export: 'escaped' },
  { name: 'no escaping (speed of light)', module: './renderers/baseline.js', export: 'raw' },
];

/** The three that can build attributes from an object. */
export const ATTR_RENDERERS = ['@itsy/html', 'htm + preact-render-to-string', 'hand-written (escape + concat)'];

/** The four in the clean table: `html`, `trusted`, and the two reference points. */
export const CLEAN_RENDERERS = [
  '@itsy/html',
  '@itsy/html trusted',
  'hand-written (escape + concat)',
  'no escaping (speed of light)',
];

/** How long mitata spends on each function. Its own default is 642 ms, more than this needs. */
export const MIN_CPU_TIME = 250e6;
