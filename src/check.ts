import type { Html } from './shared.ts';
import { audit, type Finding, type Problem, type Report, type RuleSet, type Visitor } from './audit.ts';
import { type A11yRule, a11yRules } from './a11y.ts';

export type { A11yRule, Finding, Problem, Report, RuleSet, Visitor };

/** Turning some of the accessibility rules off, with the names type-checked. */
export interface A11yOptions {
  /**
   * Rules to silence, by name. A misspelt name is a type error rather than a rule that quietly
   * stays on.
   *
   * Reach for it when a rule is wrong for a whole codebase. For one element, prefer markup that
   * says why — `alt=""`, `role="presentation"` and `aria-hidden="true"` all silence the rules that
   * apply to them, and they tell a screen reader the same thing.
   */
  without?: readonly A11yRule[];
}

/** Options for `check()`. */
export interface CheckOptions {
  /**
   * Also check that every id reference (`for`, `aria-labelledby`, `aria-controls`, …) points at an
   * id on the page, and that no id is used twice.
   * @defaultValue true
   */
  ids?: boolean;
  /**
   * The accessibility rules. `false` turns them off; an object turns some of them off by name.
   *
   * They cost nothing to leave on: the production build compiles them away with the rest of
   * `check()`.
   * @defaultValue true
   */
  a11y?: boolean | A11yOptions;
  /**
   * Custom rules, run in the same pass and reported into the same list.
   *
   * @example
   * ```ts
   * const house: RuleSet = (report) => ({
   *   open(tag, attrs, at) {
   *     if (attrs.has('style')) report('no-inline-style', 'use a utility class', at);
   *   },
   * });
   * check(Page(data), { rules: house });
   * ```
   */
  rules?: RuleSet | readonly RuleSet[];
}

// The rule sets as one, so the audit walks the markup once whatever the count. Each hook is
// forwarded to every visitor that wants it, in the order the sets were given, so their findings
// interleave in page order like any other. One set is handed over as it is, and none as nothing.
const compose = (sets: readonly RuleSet[]): RuleSet | undefined =>
  sets.length < 2
    ? sets[0]
    : (report) => {
        const visitors = sets.map((s) => s(report));
        return {
          open: (tag, attrs, at, ancestors) => {
            for (const v of visitors) v.open?.(tag, attrs, at, ancestors);
          },
          text: (content, at, ancestors) => {
            for (const v of visitors) v.text?.(content, at, ancestors);
          },
          close: (tag, at, hadText) => {
            for (const v of visitors) v.close?.(tag, at, hadText);
          },
          end: (ids) => {
            for (const v of visitors) v.end?.(ids);
          },
        };
      };

interface Check {
  /**
   * The markup check on its own. Accessibility findings are advice rather than correctness, so
   * turning them off narrows the result back to {@link Problem}.
   *
   * @example
   * ```ts
   * assert.deepEqual(check(Header(data), { a11y: false }), []);
   * ```
   */
  (markup: string | Html, options: CheckOptions & { a11y: false; rules?: undefined }): Problem[];
  /**
   * Checks a rendered page for markup the browser would silently repair, and for the
   * accessibility problems a person reading the page would pay for.
   *
   * It runs every check the template audit runs, but across the whole page, so it also sees
   * problems between templates and inside `attrs()` output, plus the two only a page can show: id
   * references (15, 16) and URLs the guard blocked (19).
   *
   * Call it where the string leaves the renderer: a test, a Storybook decorator, a dev-only
   * middleware. The production build always returns `[]` — assert {@link Check.enabled} if a
   * suite must not pass vacuously.
   *
   * @example
   * ```ts
   * assert.deepEqual(check(Page(data)), []);
   * ```
   * @returns Everything found, in page order. Empty means clean.
   * @see {@link Problem} for a markup problem, {@link Finding} for what a rule reports
   */
  (markup: string | Html, options?: CheckOptions & { rules?: undefined }): (Problem | Finding<A11yRule>)[];
  /**
   * With custom rules, whose names this cannot know, so a finding's `rule` widens to `string`.
   *
   * @example
   * ```ts
   * check(Page(data), { rules: house });
   * ```
   */
  (markup: string | Html, options: CheckOptions): (Problem | Finding)[];
  /**
   * `false` in the production build, where `check()` returns `[]` whatever it is given.
   *
   * A suite that resolves the production build passes every assertion built on `check()` without
   * looking at anything, so assert this once and the suite cannot pass having checked nothing.
   *
   * @example
   * ```ts
   * test('the markup check is active', () => assert(check.enabled));
   * ```
   */
  readonly enabled: boolean;
}

export const check = ((markup: string | Html, options?: CheckOptions) => {
  const found: (Problem | Finding)[] = [];
  if (__DEV__) {
    // What is left out takes its default, and a `null` in place of the options leaves them all out.
    // A `null` inside them is outside the types too, and reads as `false` wherever it lands: rules
    // off, id checks off, and in `rules`, one set fewer — so `rules: [flag && house]` works as it
    // reads. Never a throw.
    const { ids = true, a11y = true, rules } = options ?? {};
    // The built-in rules run first, so when they and a project's report from the same hook at the
    // same offset, theirs reads first.
    const sets: RuleSet[] = [];
    if (a11y) sets.push(a11yRules(a11y === true ? undefined : a11y.without));
    for (const set of [rules].flat()) if (typeof set === 'function') sets.push(set);
    audit([String(markup)], (p) => found.push(p), { ids }, compose(sets));
    found.sort((a, b) => a.at - b.at); // a rule reports as the audit walks; this puts everything in page order
  }
  return found;
}) as Check;

// Written as a plain assignment so the production build folds it to `check.enabled = false`. The
// cast is only to keep `enabled` readonly for everyone else.
(check as { enabled: boolean }).enabled = __DEV__;
