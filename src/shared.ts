/**
 * The error this library throws when actual code is wrong: an unquoted attribute, a plain string inside `<script>`, and so on.
 *
 * Bad data never throws.
 *
 * `code` is the same number in every build. The dev build writes the message out in full; the production build only says `E<code>`.
 *
 * @see https://itsyjs.github.io/html/reference/errors for the table of codes
 */
export class HtmlError extends Error {
  override name = 'HtmlError';
  /** Which rule was broken. The same number in every build; the docs list them. */
  code: number;
  /** @param message The full text in the dev build; `false` in production, where the build strips it. */
  constructor(code: number, message?: string | false) {
    // In production `message` is `false` (the build strips the text), so fall back to the code.
    super(message || `E${code}`);
    this.code = code;
  }
}

/**
 * A string that is already HTML: what `html` returns, or something trusted with `raw()`.
 *
 * @example
 * ```ts
 * el.innerHTML = view;
 * res.send(String(view));
 * ```
 */
export class Html extends String {
  // Type-only branding.
  // TypeScript sees the private member and treats Html as distinct, so a plain string can't pass for Html.
  declare private readonly brand: undefined;
}

/** `true` for an `Html`, from `html` or `raw()`. A plain string is `false`, even one holding markup. */
export const isHtml = (value: unknown): value is Html => value instanceof Html;

/**
 * Marks a string as trusted HTML. Nothing in it is escaped.
 *
 * @example
 * ```ts
 * html`<script>${raw(json)}</script>` // use raw to pass content into <script> - sanitize the JSON however you prefer
 * ```
 */
export const raw = (markup: string): Html => new Html(markup);

// The characters that can change meaning in text or inside a quoted attribute,
// and the first of them in a string, if it holds one at all.
const FIRST = /[&<>"']/;
/** Escapes `& < > " '`, so the browser shows the text as text. */
export const esc = (s: string): string => {
  // Most values hold none of these, and then the string is handed straight back.
  let at = s.search(FIRST);
  if (at === -1) return s;
  let out = '';
  let last = 0;
  // A switch on the character code, rather than a replace() callback: the callback
  // is a function call per match, and this is the hottest path in the library.
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
    // Two appends, not `slice + e` first: that would build a string nobody else reads.
    out += s.slice(last, at);
    out += e;
    last = at + 1;
  }
  return out + s.slice(last);
};

/**
 * The URL schemes a value may use in `href`, `src` and similar.
 *
 * `data` and `blob` are included for inline images and object URLs; `javascript` and `vbscript` are shady and always excluded.
 *
 * Denied schemes render as `about:blank#blocked`.
 *
 * To add a scheme use: `createHtml({ schemes: [...SCHEMES, 'sms'] })`.
 */
export const SCHEMES: ReadonlySet<string> = new Set(['http', 'https', 'mailto', 'tel', 'data', 'blob']);
/**
 * A legal tag name, for the places that write a tag from a string: `frame` entries and `wrap()`.
 * @internal
 */
export const TAG = /^[a-zA-Z][-\w]*$/;

/**
 * Attributes that hold a URL, so their value is scheme checked.
 *
 * `srcset`, `cite`, and `poster` take URLs but can't navigate or run script.
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
  // No colon, no scheme, so a relative URL, which always passes. Stripping the
  // characters below can never introduce a colon, so the raw string settles it.
  const colon = value.indexOf(':');
  if (colon === -1) return enc(value);
  // Browsers ignore whitespace and control characters while reading a scheme,
  // so `"  JaVa\tScRiPt:"` means `javascript:` to them. Strip before scanning.
  const scheme = value
    .slice(0, colon)
    // oxlint-disable-next-line no-control-regex -- stripping them is the point; see above
    .replace(/[\s\u0000-\u001f]+/g, '')
    .toLowerCase();
  // Not a scheme at all (a colon inside a path or a query), or an allowed one: keep the URL, just escaped.
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
