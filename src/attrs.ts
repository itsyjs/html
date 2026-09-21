import { Html, HtmlError, SCHEMES, attrValue, raw } from './shared.ts';
export { esc } from './shared.ts';

/** Anything `cx()` takes: strings, numbers, nested arrays, and `{ name: enabled }` objects. Falsy values are skipped. */
export type ClassValue = string | number | bigint | boolean | null | undefined | ClassValue[] | Record<string, unknown>;

/**
 * Joins class names: strings and numbers as they are, arrays flattened, `{ name: enabled }` objects by key.
 * `false`, `null`, `undefined`, `''`, `0` and `true` add nothing.
 *
 * @example
 * ```ts
 * cx('btn', ['lg', null], { 'is-active': true }) // 'btn lg is-active'
 * ```
 */
export const cx = (...values: ClassValue[]): string => {
  let out = '';
  for (const v of values) {
    let s = '';
    if (!v || v === true) continue; // falsey values or literal `true` -> drop
    else if (typeof v === 'object') {
      if (Array.isArray(v)) s = cx(...v); // process and flatten any arrays
      else for (const k in v) if (v[k]) s += (s ? ' ' : '') + k; // handle the object-form { active: true }
    } else s = String(v); // strings go straight in
    if (s) out += (out ? ' ' : '') + s;
  }
  return out;
};

/** A `style="…"` value as an object. Keys are written out as given: `'--brand'`, `'background-color'`. No camelCase conversion. */
export type StyleValue = Record<string, string | number | null | undefined | false>;

/** The object form of `aria` and `data` - f.ex `aria: { expanded: open }` becomes `aria-expanded="…"`. */
export type AttrGroup = Record<string, string | number | bigint | boolean | null | undefined>;

/**
 * A value for `attrs()`. `true` gives a bare attribute (`disabled`), and `false`, `null` and `undefined` omit it.
 *
 * The exceptions are `aria-*`, `draggable`, `spellcheck` and `contenteditable`, where booleans need to be "true" and "false".
 *
 * `class` takes what `cx()` takes, `style` an object, `aria` and `data` a group.
 */
export type AttrValue = string | number | bigint | boolean | null | undefined | ClassValue[] | StyleValue | AttrGroup;

// Attributes where `false` must be written out, because "absent" means something else than "false".
const TRI = /^(?:aria-|draggable$|spellcheck$|contenteditable$)/i;

// Process { color: 'red', '--x': 1 } into "color:red;--x:1;"
const style = (v: StyleValue): string => {
  let out = '';
  for (const k in v) {
    const x = v[k];
    if (x != null && x !== false) out += `${k}:${x};`;
  }
  return out;
};

/*
 * Renders one attribute onto `out` and returns the new `out`. Called again for each key of an `aria` or `data` group.
 *
 * At module scope to avoid creating a fresh allocation on every call of `createAttrs`.
 */
const one = (out: string, name: string, v: AttrValue, schemes: ReadonlySet<string>): string => {
  if (v == null) return out;
  // `tri` can only change the answer for a boolean, so nothing else pays for the regex.
  if (typeof v === 'boolean') {
    const tri = TRI.test(name); // must "false" be written out for this attribute?
    if (v === false && !tri) return out;
    out += out ? ' ' : '';
    if (!tri) return out + name; // a bare attribute, like `disabled`
    // A tri attribute's value is the word `true` or `false`: nothing to escape, and a
    // name matching TRI is never an `on*` handler and never holds a URL, so the checks
    // in attrValue have nothing to do here.
    return `${out}${name}="${v}"`;
  }
  let s: string;
  if (typeof v === 'object') {
    if (name === 'class') s = cx(v as ClassValue);
    else if (name === 'style' && !Array.isArray(v)) s = style(v as StyleValue);
    else if ((name === 'aria' || name === 'data') && !Array.isArray(v)) {
      // A group: each key becomes its own attribute, like aria-expanded.
      for (const k in v) out = one(out, `${name}-${k}`, (v as AttrGroup)[k], schemes);
      return out;
    } else throw new HtmlError(2, __DEV__ && `attribute "${name}" takes a string, number or boolean`);
  } else s = String(v);
  out += out ? ' ' : '';
  return `${out}${name}="${attrValue(name, s, schemes)}"`;
};

/**
 * Makes an `attrs()` that checks URLs against `schemes`. The root `attrs` uses the defaults; `@itsy/html/create` makes its own.
 * @internal
 */
export const createAttrs =
  (schemes: ReadonlySet<string>) =>
  (attributes: Record<string, AttrValue>): Html => {
    let out = '';
    for (const name in attributes) out = one(out, name, attributes[name], schemes);
    return raw(out);
  };

/**
 * Puts dynamic attributes on a tag. The only thing besides `raw()` that may sit inside a tag.
 *
 * Values are escaped, URL attributes are scheme-checked, and `on*` is refused.
 * Names are not checked: they are code, not data, and are written out as given.
 *
 * @example
 * ```ts
 * html`<input ${attrs({ type: 'search', disabled: busy, class: ['field', error && 'is-invalid'] })}>`
 * html`<button ${attrs({ aria: { expanded: open, controls: id }, data: { category } })}>`
 * ```
 *
 * @throws {HtmlError} code 2 for an object in an attribute other than `class`, `style`, `aria` or `data`
 * @throws {HtmlError} code 3 for an `on*` attribute
 * @see {@link AttrValue} for how booleans and objects render
 */
export const attrs = createAttrs(SCHEMES);
