import { auditTemplate } from './audit.ts';
import { BRAND, Html, HtmlError, REFUSED, SCHEMES, URL_ATTRS, esc, safeUrl } from './shared.ts';

/**
 * What a `${…}` can hold: text, numbers, `Html`, lists of these, or a function that returns one of them.
 *
 * A function is a thunk: it is called at render time.
 *
 * Objects and promises are left out on purpose. `${user}` is a type error, not `[object Object]`, and a promise would make rendering async.
 */
export type Renderable =
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | Html
  | Iterable<Renderable>
  | (() => Renderable);

/** Where one `${…}` sits in the markup. Found once per template, then reused on every render. */
export interface Context {
  /** Set when only `Html` is allowed here: inside a tag, `<script>`, `<style>` or a comment. The dev build names the place. */
  only?: string;
  /**
   * Set when the `${…}` is inside a quoted URL attribute, so its value is scheme-checked.
   *
   * Any other attribute is escaped exactly like text and needs nothing here.
   */
  url?: boolean;
  /** Dev build only, set for `trusted`: a value that escaping or the URL guard would change throws. */
  strict?: boolean;
}

// One scanned template: its static chunks, and the context of each `${…}` between them.
export interface Site {
  chunks: string[];
  contexts: Context[];
}

// What the scanner is inside.
type Mode = 'text' | 'tag' | 'value' | 'script' | 'style' | 'comment';

/**
 * Scans a template's static markup once and records the context of every `${…}`.
 * It reads only the fixed strings, never values, so data cannot fool it.
 *
 * `trusted` takes its chunks from here too, so the two tags write the same static markup.
 * @internal
 */
export const analyse = (strings: TemplateStringsArray, collapse: boolean): Site => {
  // Use the cooked strings, where `\n` is a newline, as in a normal template literal.
  // A cooked string is `undefined` only after an invalid escape. The raw text is then what was meant.
  const src = Array.from(strings, (s, i) => s ?? strings.raw[i]!);
  const last = src.length - 1;
  // Whitespace with a newline in it becomes one space, unless the template has <pre> or <textarea>.
  // One space, never nothing, so `<b>a</b>\n<i>b</i>` still reads "a b". Only the template's own edges lose it.
  const keep = !collapse || /<(?:pre|textarea)\b/i.test(src.join(''));
  const chunks = keep
    ? src
    : src.map((s, i) => {
        let c = s;
        // All three regexes here match the same thing: a run of HTML whitespace (tab, LF, FF, CR, space) with at
        // least one newline in it. `\s` cannot be used here: that also takes a no-break space, which is content.
        if (i === 0) c = c.replace(/^[\t\n\f\r ]*\n[\t\n\f\r ]*/, ''); // remove whitespace at the start
        if (i === last) c = c.replace(/[\t\n\f\r ]*\n[\t\n\f\r ]*$/, ''); // remove whitespace at the end
        return c.replace(/[\t\n\f\r ]*\n[\t\n\f\r ]*/g, ' '); // collapse contained whitespace to a single space
      });

  const contexts: Context[] = [];
  let mode: Mode = 'text';
  let tag = ''; // name of the open tag, like "script"
  let attr = ''; // the last attribute name read
  let quote = ''; // the quote that opened the current attribute value
  let after = ''; // 'eq' right after an `=`, 'bare' inside an unquoted value, else ''
  let gap = false; // inside a tag: has a separator (whitespace, `/`, a value, a `${…}`) come since the last name character?
  // Inside <script> or <style>: is a `<!--` or a `<![CDATA[` open? Both are false when a block
  // starts, since a block ends only while neither is open.
  let dash = false;
  let cdata = false;

  for (let i = 0; i < src.length; i++) {
    const s = src[i]!;
    const lower = s.toLowerCase(); // the end tags of <script> and <style> match in any case
    // Walk this chunk one character at a time and keep `mode` current.
    for (let j = 0; j < s.length; j++) {
      const ch = s[j]!;
      if (mode === 'text') {
        // The search for the comment's end starts inside its `<!--`, on purpose. The browser reads
        // `<!-->` and `<!--->` as whole comments, and the overlap ends them in the same place.
        if (s.startsWith('<!--', j)) mode = 'comment';
        // Tests the character after the `<`. When the `<` ends the chunk there is none: if a `${…}`
        // follows, the stand-in `'a'` counts it as a letter; at the end of the template, `''` fails.
        else if (ch === '<' && /[a-zA-Z!?/]/.test(s[j + 1] ?? (i < last ? 'a' : ''))) {
          // `<` followed by a letter, `!`, `?` or `/` starts a tag. A lone `<` is text. A `<` right
          // before a `${…}` is not lone: the browser reads a value that starts with a letter as the
          // tag name, so the value is inside the tag.
          mode = 'tag';
          tag = attr = after = '';
          gap = false;
        }
      } else if (mode === 'comment') {
        if (s.startsWith('-->', j) || s.startsWith('--!>', j)) mode = 'text';
      } else if (mode === 'script' || mode === 'style') {
        // Inside <script> or <style> everything is text until the end tag: `</script` then whitespace, `/` or `>`.
        // The end tag does not count while a `<!--` or `<![CDATA[` is open. In an HTML <script> that
        // is the tokenizer's escaped states. In SVG it is a comment or a CDATA section, where an end
        // tag is text. The scanner cannot tell which, so the block stays open. That can only refuse
        // more.
        if (s.startsWith('<!--', j)) dash = true;
        else if (s.startsWith('-->', j)) dash = false;
        else if (s.startsWith('<![CDATA[', j)) cdata = true;
        else if (s.startsWith(']]>', j)) cdata = false;
        else if (
          !dash &&
          !cdata &&
          lower.startsWith(`</${mode}`, j) &&
          // The character after `</script` or `</style`. At the chunk's end the stand-in `' '` counts
          // the `${…}` that follows as a separator, so `</script${x}>` still ends the block.
          /[\t\n\f\r />]/.test(s[j + mode.length + 2] ?? ' ')
        ) {
          // The character after the name is a separator, `>` or a `${…}`, and each sets `gap` itself.
          j += mode.length + 1;
          mode = 'tag';
          tag = '/'; // a stand-in name, so the tag that closes here cannot open the block again
          attr = '';
        }
      } else if (mode === 'value') {
        // Inside a quoted attribute value only the matching quote matters.
        if (ch === quote) {
          mode = 'tag';
          attr = '';
          gap = true; // whatever follows the quote starts a new attribute name, never part of the tag name
        }
      } else {
        // Inside a tag: the tag name, attribute names, `=` and `>`.
        if (after === 'eq') {
          if (ch === '"' || ch === "'") {
            mode = 'value';
            quote = ch;
            after = '';
            continue;
          }
          if (/[\t\n\f\r ]/.test(ch)) continue;
          after = ch === '>' ? '' : 'bare'; // a value with no quotes around it
        }
        if (after === 'bare') {
          if (!/[\t\n\f\r >]/.test(ch)) continue; // still inside the unquoted value
          // The value ends, and so does its attribute: in `a=b ="…"` the `=` starts a new name.
          after = attr = '';
        }
        if (ch === '>') {
          const t = tag.toLowerCase();
          mode = t === 'script' || t === 'style' ? t : 'text';
        } else if (tag === '') tag += ch; // the first character of the tag name: a letter, or `/` `!` `?`
        else if (ch === '=' && attr !== '') after = 'eq'; // `href =` still belongs to href
        else if (/[\t\n\f\r /]/.test(ch)) {
          gap = true; // a separator: the next name character starts a new name
          if (ch === '/') attr = ''; // and after a `/` even a `=` starts one, as in the browser
        } else if (!gap && attr === '') tag += ch; // the rest of the tag name
        else {
          // An attribute name. A `=` with no name before it starts one too, as in the browser.
          if (gap) attr = '';
          attr += ch;
          gap = false;
        }
      }
    }
    if (i === last) break; // nothing follows the last chunk
    // A `${…}` comes right after this chunk. Record where it sits.
    if (mode === 'value') {
      // Event handlers run their value as code: nothing dynamic goes there, not even Html.
      if (REFUSED.test(attr)) {
        throw new HtmlError(
          3,
          __DEV__ && `expression ${i}: refusing to interpolate into "${attr}": it is code, not text`,
        );
      }
      // Decided once here, not on every render: the name cannot change.
      contexts.push({ url: URL_ATTRS.has(attr.toLowerCase()) });
    } else if (mode === 'text') contexts.push({});
    else if (mode === 'tag' && after !== '') {
      throw new HtmlError(5, __DEV__ && `quote the attribute value before expression ${i}: …${s.slice(-40)}`);
    } else {
      // Inside a tag, a comment, <script> or <style>: only Html may go here.
      const name = mode === 'tag' && tag === ''; // right after a `<`, where the tag's name goes
      if (mode === 'tag') {
        // A `${…}` in a tag stands for attributes the scanner cannot see, so what follows it starts
        // a new name. A `="…"` right after it belongs to whatever the value wrote last, not to `attr`.
        gap = true;
        attr = '';
      }
      contexts.push({
        only: __DEV__
          ? name
            ? 'a tag, right after `<` where its name goes (write `&lt;` for a less-than sign)'
            : mode === 'tag'
              ? 'a tag'
              : mode === 'comment'
                ? 'a comment'
                : dash || cdata
                  ? `<${mode}>, which has a \`${dash ? '<!--' : '<![CDATA['}\` still open, so where it ends is unclear`
                  : `<${mode}>`
          : '',
      });
    }
  }
  // The dev build also checks the markup for mistakes the browser silently repairs. See audit.ts.
  if (__DEV__) auditTemplate(src);
  return { chunks, contexts };
};

// The escaper for a value that is already Html: nothing to do.
const asIs = (s: string): string => s;

// Dev build only, for `trusted`, which writes values out as they are in production: the value had
// to come through unchanged here, or production would write something `html` never would.
const unchanged = (out: string, value: string, ctx: Context, i: number): string => {
  // No `__DEV__ &&` on the message: this whole branch is gone from the production build.
  if (__DEV__ && ctx.strict && out !== value) {
    const was = JSON.stringify(value.slice(0, 60));
    const is = JSON.stringify(out.slice(0, 60));
    throw new HtmlError(
      20,
      `expression ${i}: trusted writes ${was} as it is, where html writes ${is}; use html for a template that takes this value`,
    );
  }
  return out;
};

// Turns one value into a string, escaped for the context it lands in. `i` is the number of the `${…}`, for error messages.
const render = (value: Renderable, ctx: Context, schemes: ReadonlySet<string>, i: number): string => {
  // A plain string in ordinary markup is by far the most common case, so it goes first.
  // A string where only Html may go falls through to the code 6 throw below.
  if (typeof value === 'string' && ctx.only === undefined) {
    const out = ctx.url ? safeUrl(value, schemes) : esc(value);
    return __DEV__ ? unchanged(out, value, ctx, i) : out;
  }
  if (typeof value === 'function') return render(value(), ctx, schemes, i); // call it, render what comes back
  if (value == null || value === false) return '';
  // Already Html: no escaping, but a URL attribute is still scheme-checked.
  // A true Html is read through its brand slot.
  if (value instanceof Html) {
    if (!ctx.url) return value[BRAND];
    const out = safeUrl(value[BRAND], schemes, asIs);
    return __DEV__ ? unchanged(out, value[BRAND], ctx, i) : out;
  }
  if (typeof value === 'object' && typeof value[Symbol.iterator] === 'function') {
    // A list: render each item in this same context, one after the other.
    let out = '';
    for (const item of value) out += render(item, ctx, schemes, i);
    return out;
  }
  if (ctx.only !== undefined) {
    throw new HtmlError(6, __DEV__ && `expression ${i} is inside ${ctx.only}; only raw() or attrs() may go there`);
  }
  if (value === true) return '';
  // Digits, a dot, a sign, `e`, or Infinity/NaN: nothing to escape, and never a scheme.
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  throw new HtmlError(7, __DEV__ && `expression ${i}: cannot render ${Object.prototype.toString.call(value)}`);
};

/**
 * Makes a template tag with its own URL guard, whitespace rule and template cache.
 * The root `html` uses the defaults; `@itsy/html/create` makes its own.
 *
 * @param schemes The URL schemes the guard allows, lowercase.
 * @param collapse Whether whitespace with a newline in it becomes one space in the static markup.
 * @param strict Dev build only: throw code 20 for a value escaping or the URL guard would change. The dev `trusted`.
 * @internal
 */
export const createTag = (schemes: ReadonlySet<string>, collapse: boolean, strict?: boolean) => {
  // JavaScript hands a tagged template the same `strings` array object every
  // time that line runs, so it works as a cache key: each template is scanned once.
  const sites = new WeakMap<TemplateStringsArray, Site>();
  return (strings: TemplateStringsArray, ...values: Renderable[]): Html => {
    let site = sites.get(strings);
    if (!site) {
      sites.set(strings, (site = analyse(strings, collapse)));
      if (__DEV__ && strict) for (const ctx of site.contexts) ctx.strict = true;
    }
    // Put the markup back together: static chunk, rendered value, static chunk, and so on.
    let out = site.chunks[0]!;
    for (let i = 0; i < values.length; i++) {
      out += render(values[i], site.contexts[i]!, schemes, i) + site.chunks[i + 1]!;
    }
    return new Html(out);
  };
};

/**
 * The template tag. The static markup is scanned once; every value is escaped for the context it lands in.
 *
 * @example
 * ```ts
 * html`<a href="${url}" class="link ${active && 'is-active'}">${label}</a>`
 * ```
 * @throws {HtmlError} code 3 for a `${…}` in an `on*` attribute, code 5 for one in an unquoted value
 * @throws {HtmlError} code 6 for a plain value inside a tag, `<script>`, `<style>` or a comment; code 7 for an object
 * @throws {HtmlError} codes 8 to 14, dev build only, for markup the browser would silently repair
 * @see https://itsyjs.github.io/html/reference/errors for the table of codes
 */
export const html = createTag(SCHEMES, true);
