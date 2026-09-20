import type { Html } from './shared.ts';
import { audit, type Finding, type Problem, type RuleSet } from './audit.ts';
import type { A11yRule } from './a11y.ts';

export type { Finding, Problem, RuleSet };

/** Options for `check()`. */
export interface CheckOptions {
  /**
   * Also check that every id reference (`for`, `aria-labelledby`, `aria-controls`, …) points at an id on the
   * page, and that no id is used twice.
   * @defaultValue true
   */
  ids?: boolean;
  /**
   * A rule set to run in the same pass, reporting into the same list. Pass `a11y` from
   * `@itsy/html/a11y`. Leave it out and none of its code is bundled.
   *
   * @example
   * ```ts
   * import { a11y } from '@itsy/html/a11y';
   * check(Page(data), { a11y });
   * ```
   */
  a11y?: RuleSet;
}

interface Check {
  /**
   * Checks a rendered page for markup the browser would silently repair. It runs
   * every check the template audit runs, but across the whole page, so it also
   * sees problems between templates and inside `attrs()` output, plus the two
   * only a page can show: id references (15, 16) and URLs the guard blocked (19).
   *
   * Call it where the string leaves the renderer: a test, a Storybook decorator,
   * a dev-only middleware. The production build always returns `[]`.
   *
   * @example
   * ```ts
   * assert.deepEqual(check(Header(data)), []);
   * ```
   * @returns The problems in page order. Empty means clean.
   * @see {@link Problem} for what each entry holds
   */
  (markup: string | Html, options?: CheckOptions & { a11y?: undefined }): Problem[];
  /**
   * The same check with a rule set running in the same pass. Its findings come back
   * in the same list, in page order, each carrying a `rule` name instead of a `code`.
   *
   * @example
   * ```ts
   * import { a11y } from '@itsy/html/a11y';
   * assert.deepEqual(check(Page(data), { a11y }), []);
   * ```
   * @returns Everything found, in page order. Empty means clean.
   * @see {@link Finding} for what an accessibility entry holds
   */
  (markup: string | Html, options: CheckOptions): (Problem | Finding<A11yRule>)[];
}

export const check: Check = (markup: string | Html, options: CheckOptions = {}) => {
  const found: (Problem | Finding)[] = [];
  if (__DEV__) {
    audit([String(markup)], (p) => found.push(p), { ids: options.ids ?? true }, options.a11y);
    found.sort((a, b) => a.at - b.at); // a rule reports as the audit walks; this puts everything in page order
  }
  return found as Problem[];
};
