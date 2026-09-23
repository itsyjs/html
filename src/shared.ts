/**
 * Thrown when the code is wrong, such as an unquoted attribute or a plain string inside `<script>`.
 *
 * Bad data never throws.
 *
 * `code` is the same number in every build. The dev build spells the message out; the production build says only `E<code>`.
 *
 * @see https://itsyjs.github.io/html/reference/errors for the table of codes
 */
export class HtmlError extends Error {
  override name = 'HtmlError';
  /** The rule that was broken. The same number in every build; the docs list them. */
  code: number;
  /** @param message The full text in the dev build; `false` in production, where the build strips it. */
  constructor(code: number, message?: string | false) {
    // In production `message` is `false`, so the code stands in for it.
    super(message || `E${code}`);
    this.code = code;
  }
}

// Realm-global, so every copy of this library recognises the others' Html. The renderer reads the
// markup through this same key, so `instanceof` and rendering always agree.
export const BRAND: unique symbol = Symbol.for('itsy.html');
// Node and Deno both honour this for console.log.
const INSPECT: unique symbol = Symbol.for('nodejs.util.inspect.custom');

/**
 * Markup that is already HTML: what `html` returns, or something trusted with `raw()`.
 *
 * A wrapper, on purpose, not a `String` subclass. Subclassing a builtin makes V8 drop the fast
 * paths for `String.prototype` methods in the whole process. `charCodeAt` alone gets 9x slower,
 * and `esc()` calls it once per character. Declaring the subclass is enough, with no instance,
 * and every library in the process pays.
 *
 * See <https://github.com/tc39/proposal-rm-builtin-subclassing> for why builtins behave this way.
 *
 * @example
 * ```ts
 * el.innerHTML = view; // coerces via toString() but TypeScript will be grumpy about it
 * res.send(view.markup);
 * ```
 */
export class Html {
  // A `#private` field brands the type, so TypeScript never takes a string for trusted markup.
  readonly #markup: string;

  constructor(markup: string) {
    // `instanceof` reads this through BRAND and expects a string. Only the types stop `raw(5)`.
    this.#markup = typeof markup === 'string' ? markup : String(markup);
  }

  get markup(): string {
    return this.#markup;
  }

  get [BRAND](): string {
    return this.#markup;
  }

  /** Cross-realm `instanceof`, via the brand instead of the prototype chain. */
  static [Symbol.hasInstance](value: unknown): boolean {
    return typeof (value as { [BRAND]?: unknown } | null | undefined)?.[BRAND] === 'string';
  }

  /** Every coercion (`${view}`, `view + ''`, `String(view)`) uses this, not `toString`. */
  [Symbol.toPrimitive](): string {
    return this.#markup;
  }

  toString(): string {
    return this.#markup;
  }

  /** Makes `JSON.stringify({ view })` work. */
  toJSON(): string {
    return this.#markup;
  }

  /** `Object.prototype.toString.call(view)` reports `[object Html]` rather than `[object Object]`. */
  get [Symbol.toStringTag](): string {
    return 'Html';
  }

  /**
   * Makes `console.log(view)` readable in the dev build.
   * It has to be a static block for the dev bundle to work.
   */
  static {
    if (__DEV__) {
      Object.defineProperty(this.prototype, INSPECT, {
        value(this: Html, _depth: unknown, options: unknown, inspect?: (v: unknown, o: unknown) => string) {
          return `Html ${inspect ? inspect(this.markup, options) : JSON.stringify(this.markup)}`;
        },
      });
    }
  }
}

/** `true` for an `Html`, which only `html` and `raw()` make. */
export const isHtml = (value: unknown): value is Html => value instanceof Html;

/**
 * Marks a string as trusted HTML. Nothing in it is escaped.
 *
 * @example
 * ```ts
 * html`<script>${raw(json)}</script>` // use raw to pass content into <script> - sanitize the JSON first
 * ```
 */
export const raw = (markup: string): Html => new Html(markup);

// Finds the first character that can change meaning in text or in a quoted attribute.
const FIRST = /[&<>"']/;
/** Escapes `& < > " '`, so the browser shows the text as text. */
export const esc = (s: string): string => {
  // Most values hold none of these, so they come back unchanged.
  let at = s.search(FIRST);
  if (at === -1) return s;
  let out = '';
  let last = 0;
  // A switch on the character code, not a `replace()` callback. The callback costs a
  // function call per match, and this is the hottest path in the library.
  for (; at < s.length; at++) {
    let e: string;
    switch (s.charCodeAt(at)) {
      case 38:
        e = '&amp;';
        break;
      case 60:
        e = '&lt;';
        break;
      case 62:
        e = '&gt;';
        break;
      case 34:
        e = '&quot;';
        break;
      case 39:
        e = '&#39;';
        break;
      default:
        continue;
    }
    // Two appends, not `slice + e`, which would build a throwaway string.
    out += s.slice(last, at);
    out += e;
    last = at + 1;
  }
  return out + s.slice(last);
};

/**
 * The URL schemes a value may use in `href`, `src` and similar.
 *
 * `data` and `blob` are there for inline images and object URLs. `javascript` and `vbscript` run script, so they are left out.
 *
 * Denied schemes render as `about:blank#blocked`.
 *
 * To add a scheme: `createHtml({ schemes: [...SCHEMES, 'sms'] })`.
 */
export const SCHEMES: ReadonlySet<string> = new Set(['http', 'https', 'mailto', 'tel', 'data', 'blob']);
/**
 * A legal tag name, for the places that write a tag from a string: `frame` entries and `wrap()`.
 * @internal
 */
export const TAG = /^[a-zA-Z][-\w]*$/;

/**
 * Attributes that hold a URL, so their values are scheme-checked.
 *
 * `srcset`, `cite` and `poster` take URLs but cannot navigate or run script.
 * @internal
 */
export const URL_ATTRS = new Set(['href', 'src', 'action', 'formaction', 'data', 'xlink:href']);

/**
 * Attributes that run their value as code: the event handlers. Nothing dynamic goes in them, not even `Html`.
 * @internal
 */
export const REFUSED = /^on[a-z]/i;

// A legal scheme name: what sits before the `:` in `https://…`.
const SCHEME = /^[a-z][a-z0-9+.-]*$/;

/**
 * Escapes a URL with `enc`, and blocks it if its scheme is not allowed. A URL with no scheme (a relative one) always passes.
 *
 * @param enc `esc` for a string. For `Html`, which is checked but must not be escaped again, pass an identity.
 * @internal
 */
export const safeUrl = (value: string, schemes: ReadonlySet<string>, enc = esc): string => {
  // No colon means no scheme: a relative URL, which always passes. The stripping
  // below never adds a colon, so the raw string decides.
  const colon = value.indexOf(':');
  if (colon === -1) return enc(value);
  // Browsers ignore whitespace and control characters while reading a scheme,
  // so `"  JaVa\tScRiPt:"` means `javascript:` to them. Strip before scanning.
  const scheme = value
    .slice(0, colon)
    // oxlint-disable-next-line no-control-regex -- stripping them is the point; see above
    .replace(/[\s\u0000-\u001f]+/g, '')
    .toLowerCase();
  // Not a scheme (a colon in a path or a query), or an allowed one: keep the URL, escaped.
  if (!SCHEME.test(scheme) || schemes.has(scheme)) return enc(value);
  return 'about:blank#blocked';
};

/**
 * Escapes a value for the attribute it goes in: URL check for URL attributes, refusal for code attributes, plain escaping otherwise.
 *
 * @throws {HtmlError} code 3 for an `on*` attribute
 * @internal
 */
export const attrValue = (name: string, value: string, schemes: ReadonlySet<string>): string => {
  const n = name.toLowerCase();
  if (REFUSED.test(n))
    throw new HtmlError(3, __DEV__ && `refusing to interpolate into "${name}": it is code, not text`);
  return URL_ATTRS.has(n) ? safeUrl(value, schemes) : esc(value);
};
