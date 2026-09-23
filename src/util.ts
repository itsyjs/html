// Opt-in helpers, one export each, with no shared state, so a bundler keeps
// only the ones imported. The list helpers return plain arrays and render
// nothing: the template they land in escapes every item for its context.
// Only `wrap()` and `comment()` write markup, and they need `raw()` to do it.
import { attrs, type AttrValue } from './attrs.ts';
import type { Renderable } from './html.ts';
import { Html, HtmlError, TAG, raw } from './shared.ts';

/**
 * Puts `joiner` between the items. Nothing is rendered here; the template does that.
 *
 * @example
 * ```ts
 * html`<p>${join(tags.map(Tag), ', ')}</p>`
 * ```
 * @param joiner Anything renderable: a string, `Html`, a nested template.
 */
export const join = <I extends Renderable, J extends Renderable>(
  items: Iterable<I> | undefined,
  joiner: J,
): (I | J)[] => {
  const out: (I | J)[] = [];
  if (items) for (const item of items) out.push(...(out.length ? [joiner, item] : [item]));
  return out;
};

/**
 * `Array.prototype.map` for any iterable, with the index. For a `Set`, a
 * `Map.values()` or a generator, which have no `.map` of their own.
 *
 * @example
 * ```ts
 * html`<ul>${map(ids, (id, i) => html`<li>${i}: ${id}</li>`)}</ul>`
 * ```
 */
export const map = <T>(items: Iterable<T> | undefined, f: (item: T, index: number) => Renderable): Renderable[] => {
  const out: Renderable[] = [];
  if (items) for (const item of items) out.push(f(item, out.length));
  return out;
};

/**
 * The integers from `start` up to, not including, `end`, `step` apart. One
 * argument means `range(0, end)`. A negative step counts down.
 *
 * @example
 * ```ts
 * map(range(5), Star) // 0 1 2 3 4
 * range(1, 10, 3) // [1, 4, 7]
 * ```
 */
export function range(end: number): number[];
export function range(start: number, end: number, step?: number): number[];
export function range(a: number, b?: number, step = 1): number[] {
  const [start, end] = b === undefined ? [0, a] : [a, b];
  const out: number[] = [];
  for (let i = start; step > 0 ? i < end : i > end; i += step) out.push(i);
  return out;
}

/**
 * One branch or the other, built only when chosen. With no `falseFn`, a false
 * condition renders nothing.
 *
 * @example
 * ```ts
 * when(user, () => Profile(user), () => Login())
 * ```
 */
export const when = <T extends Renderable, F extends Renderable>(
  condition: unknown,
  trueFn: () => T,
  falseFn?: () => F,
): T | F | undefined => (condition ? trueFn() : falseFn?.());

/**
 * A `switch` as an expression: the first case whose value `===` `value` is
 * built, else `fallback`, else nothing.
 *
 * @example
 * ```ts
 * choose(status, [['ok', () => Ok()], ['err', () => Err()]], () => Unknown())
 * ```
 * @param cases `[value, thunk]` pairs, tried in order with `===`.
 */
export const choose = <T, V extends Renderable>(
  value: T,
  cases: readonly (readonly [T, () => V])[],
  fallback?: () => V,
): V | undefined => {
  for (const [v, f] of cases) if (v === value) return f();
  return fallback?.();
};

/**
 * Each item inside a `<tag>`, with optional attributes through `attrs()`. The
 * template renders the items, so text is escaped and `Html` is not.
 *
 * Inside `<script>` and `<style>` an item must be `Html`, as it must in a
 * template: escaped text there is still code.
 *
 * @example
 * ```ts
 * html`<ul>${wrap(names, 'li', { class: 'name' })}</ul>`
 * ```
 * @throws {HtmlError} code 17 for a bad tag name, code 6 for an item in `<script>` or `<style>` that is not `Html`
 */
export const wrap = (
  items: Iterable<Renderable>,
  tag: string,
  attributes?: Record<string, AttrValue>,
): Renderable[] => {
  if (!TAG.test(tag)) throw new HtmlError(17, __DEV__ && `bad tag name "${tag}"`);
  const open = raw(`<${tag}${attributes ? ` ${attrs(attributes).markup}` : ''}>`);
  const close = raw(`</${tag}>`);
  // The template sees only Html here and cannot tell these tags apart, so the check is here.
  const code = /^(script|style)$/i.test(tag);
  return map(items, (item) => {
    if (code && !(item instanceof Html)) throw new HtmlError(6, __DEV__ && `an item in <${tag}> must be raw()`);
    return [open, item, close];
  });
};

/**
 * An HTML comment that its text cannot close. A comment ends at `-->` or
 * `--!>`, so every `--` gets a space in it. `<!-->` and `<!--->` close at
 * once, so the text gets a space on each side.
 *
 * @example
 * ```ts
 * html`${comment(userText)}`
 * ```
 */
export const comment = (text: string): Html => raw(`<!-- ${text.replace(/-(?=-)/g, '- ')} -->`);
