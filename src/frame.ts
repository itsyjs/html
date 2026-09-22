// The frame around a page: `<!doctype html>`, `<html lang>`, a `<head>` with no
// duplicates, and a body in the right order: header, `<main>`, footer, scripts.
// `head()` and `element()` are the same building blocks without the skeleton,
// for a layout that writes `<html>` itself and only needs the merged head.
import { attrs, type AttrValue } from './attrs.ts';
import { html, type Renderable } from './html.ts';
import { Html, HtmlError, TAG, raw } from './shared.ts';

/** A head or script element written as data: `{ tag: 'link', attrs: { rel: 'icon', href } }`. */
export interface HeadEntry {
  /** The element name, like `link` or `script`. Must be a legal tag name. */
  tag: string;
  /** Attributes, rendered through `attrs()`. */
  attrs?: Record<string, AttrValue>;
  /**
   * Text (escaped), `Html`, or a function returning either. A `<script>` or `<style>` body must be `Html`,
   * from `raw()`. A void element takes none.
   */
  body?: Renderable;
  /** Overrides how this entry is identified. Of two entries with the same identity, the later one wins, in the earlier one's place. */
  key?: string;
}

/** What `head` and `scripts` accept: entries, or ready-made `Html` that is passed through as-is and never deduplicated. */
export type FramePart = HeadEntry | Html;

/** Everything `frame()` takes. Only `lang` and `title` are required. */
export interface FrameOptions {
  /** `<html lang>`. Required, because a page without a language is a bug. */
  lang: string;
  /** `<title>`, escaped. Required for the same reason. */
  title: string;
  /** `<meta name="description">`, escaped, placed right after the title. A head entry with the same name replaces it. */
  description?: string;
  /** `<html dir>`. */
  dir?: 'ltr' | 'rtl' | 'auto';
  /** Head entries after charset, viewport, title and description. A later entry replaces an earlier one with the same identity. */
  head?: FramePart | Iterable<FramePart>;
  /** Goes right after `<body>`. */
  header?: Renderable;
  /** Goes inside `<main id="maincontent" tabindex="-1">`, the target of a skip link. See `main`. */
  content?: Renderable;
  /**
   * `false` writes `content` without the `<main>` wrapper, for a page that has its own.
   * @defaultValue true
   */
  main?: boolean;
  /** Goes after `<main>`, before the scripts. */
  footer?: Renderable;
  /** Goes right before `</body>`: script entries, or ready-made `Html`. */
  scripts?: FramePart | Iterable<FramePart>;
  /** Added to every `<script>` and `<style>` entry that has no nonce of its own. Ready-made `Html` is not touched. */
  nonce?: string;
  /** Extra attributes for the three elements the frame writes. `main` is merged over the default `id` and `tabindex`. */
  attrs?: {
    html?: Record<string, AttrValue>;
    body?: Record<string, AttrValue>;
    main?: Record<string, AttrValue>;
  };
}

// Elements that never have an end tag.
const VOID = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
// Link rels that are icons; one is kept per type and size.
const ICON = new Set(['icon', 'apple-touch-icon']);

// Works out what makes an entry unique, so a later entry can replace an earlier one.
// Returns `undefined` for entries that may appear any number of times.
const keyOf = (e: HeadEntry): string | undefined => {
  if (e.key !== undefined) return e.key;
  const a = e.attrs ?? {};
  // An attribute as a string, or '' when it is missing or not a string or number.
  const s = (name: string): string => {
    const v = a[name];
    return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
  };
  const tag = e.tag.toLowerCase();
  switch (tag) {
    case 'title':
    case 'base':
      return tag; // only one of each
    case 'meta':
      if (a.charset != null) return 'charset';
      // One per name, property or http-equiv.
      return s('name')
        ? `meta:${s('name')}`
        : s('property')
          ? `meta:${s('property')}`
          : s('http-equiv')
            ? `meta:${s('http-equiv')}`
            : undefined;
    case 'link': {
      const rel = s('rel');
      if (ICON.has(rel)) return `link:${rel}:${s('type')}:${s('sizes')}`; // one icon per type and size
      if (rel === 'canonical' || rel === 'manifest') return `link:${rel}`; // only one of each
      return rel && s('href') ? `link:${rel}:${s('href')}` : undefined; // otherwise one per rel and href
    }
    case 'script':
      return s('src') ? `script:${s('src')}` : undefined; // one per src; inline scripts are always unique
    default:
      return undefined;
  }
};

// `<tag attr="…">`, with no trailing space when there are no attributes.
const open = (tag: string, a: Record<string, AttrValue> | undefined): string => {
  const at = attrs(a ?? {}).markup;
  return `<${tag}${at && ' ' + at}>`;
};

/**
 * Renders one entry. Void elements get no end tag, a `<script>` or `<style>` body must be `Html`,
 * a function body is called, and the nonce is added if the entry has none.
 *
 * @example
 * ```ts
 * element({ tag: 'link', attrs: { rel: 'icon', href: '/icon.svg' } }) // <link rel="icon" href="/icon.svg">
 * ```
 * @param nonce Added to a `<script>` or `<style>` entry that has no `nonce` of its own.
 * @throws {HtmlError} code 17 for a bad tag name, code 18 for a body on a void element
 * @throws {HtmlError} code 6 for a `<script>` or `<style>` body that is not `Html`
 */
export const element = (e: HeadEntry, nonce?: string): Html => {
  if (!TAG.test(e.tag)) throw new HtmlError(17, __DEV__ && `bad tag name "${e.tag}"`);
  const tag = e.tag.toLowerCase();
  const a = { ...e.attrs };
  const code = tag === 'script' || tag === 'style';
  if (nonce !== undefined && code && a.nonce == null) a.nonce = nonce;
  const start = open(tag, a);
  let b: Renderable = e.body;
  while (typeof b === 'function') b = b(); // a thunk is called at render, as it is in a template
  let body = '';
  if (b != null && b !== false) {
    if (VOID.has(tag)) throw new HtmlError(18, __DEV__ && `<${tag}> is a void element: it cannot have a body`);
    if (code) {
      // Escaping would break code, so the body must already be safe HTML.
      if (!(b instanceof Html)) throw new HtmlError(6, __DEV__ && `a <${tag}> body must be raw()`);
      body = b.markup;
    } else body = html`${b}`.markup; // escaped like any text
  }
  return raw(VOID.has(tag) ? start : `${start}${body}</${tag}>`);
};

// The merged head: identity to rendered element. A Map keeps insertion order, and setting
// a key that already exists keeps its place. That is exactly "later wins, in the earlier position".
type Merged = Map<string | symbol, string>;

// Accepts one part, a list of parts, or nothing, and always gives back a list.
// An `Html` is not iterable, so it lands in the single-part branch like an entry does.
const list = (x: FramePart | Iterable<FramePart> | undefined): Iterable<FramePart> => {
  if (x == null) return [];
  if (typeof (x as Iterable<FramePart>)[Symbol.iterator] !== 'function') return [x as FramePart];
  return x as Iterable<FramePart>;
};

// Renders each part into `into`. Parts with no identity get a unique Symbol as key, so nothing ever replaces them.
const merge = (parts: Iterable<FramePart>, nonce: string | undefined, into: Merged = new Map()): Merged => {
  for (const p of parts) {
    if (p instanceof Html) into.set(Symbol(), p.markup);
    else into.set(keyOf(p) ?? Symbol(), element(p, nonce).markup);
  }
  return into;
};

const concat = (m: Merged): string => [...m.values()].join('');

/**
 * The merged head without the skeleton, for a layout that writes `<html>` itself.
 *
 * @example
 * ```ts
 * html`<head>${head([...shared, ...page], { nonce })}</head>`
 * ```
 */
export const head = (parts: FramePart | Iterable<FramePart>, options: { nonce?: string } = {}): Html =>
  raw(concat(merge(list(parts), options.nonce)));

/**
 * The whole page: doctype, `<html lang>`, the merged head, then header, `<main>`, footer and scripts.
 *
 * @example
 * ```ts
 * frame({ lang: 'nb', title, head: assets, header: Header(data), content, footer: Footer(data), scripts })
 * ```
 * @throws {HtmlError} the same codes as {@link element}, for any entry in `head` or `scripts`
 */
export const frame = (o: FrameOptions): Html => {
  // The head starts with the three things every page needs, in the order browsers want them.
  const headEntries = merge(
    [
      { tag: 'meta', attrs: { charset: 'utf-8' } },
      { tag: 'meta', attrs: { name: 'viewport', content: 'width=device-width, initial-scale=1' } },
      { tag: 'title', body: o.title },
    ],
    o.nonce,
  );
  if (o.description !== undefined) {
    merge([{ tag: 'meta', attrs: { name: 'description', content: o.description } }], o.nonce, headEntries);
  }
  merge(list(o.head), o.nonce, headEntries); // the caller's entries; any with a known identity replace the above

  const header = html`${o.header}`.markup;
  const content = html`${o.content}`.markup;
  const footer = html`${o.footer}`.markup;
  const scripts = concat(merge(list(o.scripts), o.nonce));
  const main =
    o.main === false
      ? content
      : open('main', { id: 'maincontent', tabindex: -1, ...o.attrs?.main }) + content + '</main>';

  return raw(
    [
      '<!doctype html>',
      open('html', { lang: o.lang, dir: o.dir, ...o.attrs?.html }),
      '<head>',
      concat(headEntries),
      '</head>',
      open('body', o.attrs?.body),
      header,
      main,
      footer,
      scripts,
      '</body>',
      '</html>',
    ].join(''),
  );
};
