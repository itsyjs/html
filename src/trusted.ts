// `html` without the escaping, for templates that never see user content. Production writes every
// value out as it is. The dev build is `html` itself, plus one check: any value escaping or the URL
// guard would change throws code 20. So whenever dev passes, production writes what `html` would.
import { type Renderable, analyse, createTag } from './html.ts';
import { BRAND, Html, HtmlError, SCHEMES } from './shared.ts';

// `html`'s render with the context taken out: nothing is escaped, and nothing is refused but objects.
const render = (value: Renderable): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'function') return render(value());
  if (value == null || typeof value === 'boolean') return '';
  if (value instanceof Html) return value[BRAND];
  if (typeof value === 'object' && typeof value[Symbol.iterator] === 'function') {
    let out = '';
    for (const item of value) out += render(item);
    return out;
  }
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  throw new HtmlError(7, __DEV__ && `cannot render ${Object.prototype.toString.call(value)}`);
};

// The static chunks, from `html`'s own scan: the same markup, and the rules that hold whatever the
// values are (codes 3 and 5) still hold. The contexts go unused; nothing is escaped by them.
const sites = new WeakMap<TemplateStringsArray, string[]>();

/**
 * The production `trusted`. The source's tests reach it here, since `trusted` is bound once, to one build.
 *
 * An arrow function and not a factory's result, so a bundler drops it when `trusted` goes unused.
 * @internal
 */
export const passthrough = (strings: TemplateStringsArray, ...values: Renderable[]): Html => {
  let chunks = sites.get(strings);
  if (!chunks) sites.set(strings, (chunks = analyse(strings, true).chunks));
  let out = chunks[0]!;
  for (let i = 0; i < values.length; i++) out += render(values[i]) + chunks[i + 1]!;
  return new Html(out);
};

/**
 * `html` without the escaping, for templates that never take user content. It is 1.5–2.5x as fast on clean data.
 *
 * Production writes every value as it is: no escaping, no URL guard, and no code 6 check. It still
 * scans each template once, so codes 3 and 5 hold. The dev build is `html` with one more rule. A
 * value that escaping or the URL guard would change throws code 20. Whenever dev passes,
 * production writes exactly what `html` would.
 *
 * Its output is `Html`, and nests into `html` unescaped. Use it only where every value is yours.
 *
 * @example
 * ```ts
 * trusted`<nav>${links.map((l) => trusted`<a href="${l.href}">${l.label}</a>`)}</nav>`
 * ```
 * @throws {HtmlError} dev build only: code 20 for a value `html` would write differently, and every code `html` throws
 * @see https://itsyjs.github.io/html/reference/errors#e20
 */
export const trusted: (strings: TemplateStringsArray, ...values: Renderable[]) => Html = __DEV__
  ? createTag(SCHEMES, true, true)
  : passthrough;
