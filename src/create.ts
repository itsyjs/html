// Opt-in: an `html` and `attrs` pair with its own URL guard and whitespace rule.
// The root exports use the defaults. This entry lets a page allow another
// scheme, or keep markup as written, without every other page paying for the
// options.
import { createAttrs } from './attrs.ts';
import { createTag } from './html.ts';
import { SCHEMES } from './shared.ts';

export { SCHEMES };

/** Options for `createHtml()`. */
export interface CreateOptions {
  /**
   * The allowed URL schemes, lowercase. Replaces the default set; spread `SCHEMES` to add to it.
   * @defaultValue SCHEMES
   */
  schemes?: Iterable<string>;
  /**
   * `false` keeps line breaks and indentation in the static markup as written.
   * @defaultValue true
   */
  collapse?: boolean;
}

/**
 * An `html` tag and a matching `attrs()` that share one URL guard and one
 * template cache. Make the pair once, at module scope, and use it across that
 * page. `frame` and `wrap()` keep the defaults.
 *
 * @example
 * ```ts
 * export const { html, attrs } = createHtml({ schemes: [...SCHEMES, 'sms'] });
 * ```
 * @see {@link SCHEMES} for the default set
 */
export const createHtml = (options: CreateOptions = {}) => {
  const schemes: ReadonlySet<string> = new Set(options.schemes ?? SCHEMES);
  return { html: createTag(schemes, options.collapse ?? true), attrs: createAttrs(schemes) };
};
