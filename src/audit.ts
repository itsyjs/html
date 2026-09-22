// Dev-only checks for markup the browser would silently "repair": tags never
// closed, wrong end tags, `<div />`, `</br>`, nesting the parser rewrites,
// duplicate attributes, and over a whole page, dangling id references and
// duplicate ids.
//
// This file never affects escaping. It only adds errors, so a mistake in here
// can give a false error but never a wrong escape. Every call to it sits behind
// `__DEV__`, so production builds drop the file entirely.
//
// The nesting tables come from Svelte's html-tree-validation.js (MIT), which
// took them from React's validateDOMNesting. The `<p>` list is completed from the spec.
import { HtmlError } from './shared.ts';

/** One thing wrong with the markup, as `check()` reports it. */
export interface Problem {
  /** Same numbers as `HtmlError.code`. 8 to 14 come from the template audit; 15, 16 and 19 only from `check()`. */
  code: number;
  /** What is wrong and what the browser does instead. */
  message: string;
  /** Where in the markup, as a character offset. A `${…}` counts as the four characters `${…}`. */
  at: number;
  /** The markup around `at`, with whitespace squeezed. */
  near: string;
}

/**
 * One finding, as a rule set reports it: an accessibility rule's, or a project's own. Advice, never
 * a reason to throw.
 *
 * @typeParam R The rule names this finding can carry. With only the built-in rules running,
 * `check()` fills in `A11yRule`, so a misspelt name in a comparison is a type error rather than a
 * test that never matches.
 */
export interface Finding<R extends string = string> {
  /** Which rule found it, e.g. `img-alt`. Names, not numbers: these are not `HtmlError` codes. */
  rule: R;
  /** What is wrong, and what it means for someone reading the page. */
  message: string;
  /** Where in the markup, as a character offset. */
  at: number;
  /** The markup around `at`, with whitespace squeezed. */
  near: string;
}

/** How a rule reports. `near` is filled in here, so a rule never has to look at the markup itself. */
export type Report = (rule: string, message: string, at: number) => void;

/**
 * What a rule set sees as the audit walks the markup. One element at a time, in page order.
 *
 * Every hook is optional: a rule set implements only what it needs.
 */
export interface Visitor {
  /**
   * A start tag, with its attributes and the elements it sits inside, outermost first. Both are
   * the rule set's to keep: the walk carries on with its own.
   */
  open?: (tag: string, attrs: ReadonlyMap<string, string>, at: number, ancestors: readonly string[]) => void;
  /**
   * A run of text, as written: everything between two tags, or the whole body of `<script>`,
   * `<style>`, `<textarea>` and `<title>`. Never empty. Entities are not decoded, and a `<` that
   * opens no tag is text, as the browser reads it.
   */
  text?: (content: string, at: number) => void;
  /** An element closed. `at` is where it started, and `hadText` says whether it held anything but whitespace. */
  close?: (tag: string, at: number, hadText: boolean) => void;
  /** The end of the markup, with every id on the page and where it was seen. */
  end?: (ids: ReadonlyMap<string, number>) => void;
}

/**
 * A set of rules `check()` runs in the same pass as the markup audit, reporting into the same list.
 *
 * Called once per `check()` with a `report` function; the {@link Visitor} it returns is then driven
 * over the markup in page order. Keep per-run state in the closure, as the accessibility rules do.
 *
 * @example
 * ```ts
 * const house: RuleSet = (report) => ({
 *   open(tag, attrs, at) {
 *     if (attrs.has('style')) report('no-inline-style', 'use a utility class', at);
 *   },
 * });
 * ```
 */
export type RuleSet = (report: Report) => Visitor;

// Stands in for a `${…}` when a template is audited. Inside a tag it means "some attributes we cannot see".
const EXPRESSION = '${…}';

// Elements that never have content or an end tag.
const VOID = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
// Elements whose content is plain text up to the end tag, so a `<` inside them is not a tag.
const RAW = new Set(['script', 'style', 'textarea', 'title']);
// Inside these, `/>` really does self-close, and the HTML nesting rules do not apply. A
// <foreignObject> inside them is HTML again.
const FOREIGN = new Set(['svg', 'math']);

interface Rule {
  /** Tags that may not be a direct child. */
  direct?: string[];
  /** Tags that may not appear anywhere inside. */
  descendant?: string[];
  /** The only tags allowed as direct children. */
  only?: string[];
  /** If one of these sits in between, the `descendant` rule no longer applies. */
  resetBy?: string[];
}

const H = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
const T = ['style', 'script', 'template'];
const DT: Rule = { descendant: ['dt', 'dd'], resetBy: ['dl'] };
const R: Rule = { descendant: ['rt', 'rp'] };

// Elements the browser closes for you when one of the listed tags starts. The spec lets their
// end tags be left out; this audit reports them anyway, so a template reads as it parses.
const CLOSES: Record<string, Rule> = {
  li: { direct: ['li'] },
  dt: DT,
  dd: DT,
  p: {
    descendant: [
      ...'address article aside blockquote details dialog div dl fieldset figcaption figure footer form'.split(' '),
      ...H,
      ...'header hgroup hr li dd dt main menu nav ol p pre search section summary table ul'.split(' '),
    ],
  },
  rt: R,
  rp: R,
  optgroup: { descendant: ['optgroup'] },
  option: { descendant: ['option', 'optgroup'] },
  thead: { direct: ['tbody', 'tfoot'] },
  tbody: { direct: ['tbody', 'tfoot'] },
  tfoot: { direct: ['tbody'] },
  tr: { direct: ['tr', 'tbody'] },
  td: { direct: ['td', 'th', 'tr'] },
  th: { direct: ['td', 'th', 'tr'] },
};

// Children the browser moves somewhere else, splits, or drops.
const DISALLOWED: Record<string, Rule> = {
  ...CLOSES,
  form: { descendant: ['form'] },
  a: { descendant: ['a'] },
  button: { descendant: ['button'] },
  ...Object.fromEntries(H.map((h) => [h, { descendant: H }])),
  tr: { only: ['th', 'td', ...T] },
  tbody: { only: ['tr', ...T] },
  thead: { only: ['tr', ...T] },
  tfoot: { only: ['tr', ...T] },
  colgroup: { only: ['col', 'template'] },
  table: { only: ['caption', 'colgroup', 'tbody', 'thead', 'tfoot', ...T] },
  head: { only: 'base basefont bgsound link meta title noscript noframes style script template'.split(' ') },
  html: { only: ['head', 'body', 'frameset'] },
};

// Attributes whose value is an id, or a space-separated list of ids, that must exist on the page.
const IDREFS = new Set(
  'for form list headers popovertarget commandfor itemref aria-labelledby aria-describedby aria-controls aria-owns aria-details aria-errormessage aria-flowto aria-activedescendant'.split(
    ' ',
  ),
);

const WS = /\s/;
// Where markup starts: `<` before a letter, `!` or `?`, or `</` before a letter. The browser reads
// any other `<` as text, and so does the audit.
const MARKUP = /<[a-z!?]|<\/[a-z]/gi;
// What the URL guard renders in place of a blocked URL. Kept in step with `safeUrl` in shared.ts.
const BLOCKED = 'about:blank#blocked';

/**
 * Reads markup and reports every problem, in order.
 *
 * @param chunks A template's static chunks (a `${…}` sits between each pair), or one rendered page as a single chunk.
 * @param report Called once per problem, in markup order.
 * @param page Set for a rendered page. Turns on the blocked-URL check, and `page.ids` the id checks; both only make sense for a whole page.
 * @param ruleSet A rule set to run in the same pass. It reports findings alongside the problems.
 * @internal
 */
export const audit = (
  chunks: readonly string[],
  report: (p: Problem | Finding) => void,
  page?: { ids: boolean },
  ruleSet?: RuleSet,
): void => {
  const ids = page?.ids ?? false;
  const text = chunks.join(EXPRESSION);
  // Tag and attribute names are compared in lowercase. ASCII only, because `toLowerCase()` on
  // `\u0130` (the Turkish dotted capital I) returns two characters, and every offset after it
  // would then be wrong. The HTML parser lowercases only ASCII in names too.
  const lower = text.replace(/[A-Z]/g, (c) => c.toLowerCase());
  const n = text.length;
  const near = (at: number) => text.slice(Math.max(0, at - 40), at + 30).replace(/\s+/g, ' ');
  const problem = (code: number, at: number, message: string) => report({ code, message, at, near: near(at) });
  // The rule set, if there is one, reporting through the same list.
  const visit = ruleSet?.((r, message, at) => report({ rule: r, message, at, near: near(at) }));

  const stack: string[] = []; // the elements currently open, outermost first
  const openedAt: number[] = []; // where each of them started
  const held: boolean[] = []; // did each of them hold any text
  const idAt = new Map<string, number>(); // every id seen, and where
  const refs: [attr: string, id: string, at: number][] = []; // every id reference, checked at the end

  const push = (name: string, at: number) => {
    stack.push(name);
    openedAt.push(at);
    held.push(false);
  };
  const pop = (): string => {
    const from = openedAt.pop()!;
    const hadText = held.pop()!;
    const name = stack.pop()!;
    if (hadText && held.length) held[held.length - 1] = true; // text in a child is text in its parent
    visit?.close?.(name, from, hadText);
    return name;
  };
  // A start tag, handed to the rule set. The ancestors go as a copy: the stack moves on, and a rule
  // set may keep what it was given.
  const enter = (name: string, attrMap: ReadonlyMap<string, string>, at: number) =>
    visit?.open?.(name, attrMap, at, stack.slice());
  // A run of text, taken whole so a rule set can read what it says. Whether it holds anything but
  // whitespace is all the walk itself needs from it, and only for a rule set's `close`.
  const onText = (from: number, to: number) => {
    if (!visit || from === to) return;
    const run = text.slice(from, to);
    if (held.length && run.trim()) held[held.length - 1] = true;
    visit.text?.(run, from);
  };
  // Are we inside <svg> or <math>? The nearest of those and <foreignObject> decides: inside a
  // <foreignObject> the content is HTML again, with its nesting rules and its void elements.
  const foreign = (): boolean => {
    for (let k = stack.length - 1; k >= 0; k--) {
      const name = stack[k]!;
      if (name === 'foreignobject') return false;
      if (FOREIGN.has(name)) return true;
    }
    return false;
  };

  // A start tag was read.
  const open = (name: string, at: number, selfClosing: boolean, attrMap: ReadonlyMap<string, string>) => {
    if (foreign() || FOREIGN.has(name)) {
      // Inside SVG or MathML there are no nesting rules, and `/>` works. A rule set still needs
      // the close, or a self-closing tag leaves it waiting for an element that never ends.
      enter(name, attrMap, at);
      if (selfClosing) visit?.close?.(name, at, false);
      else push(name, at);
      return;
    }
    // <br>, <img> and friends never open anything, though a rule still wants to see them.
    if (VOID.has(name)) return enter(name, attrMap, at);
    if (selfClosing) {
      problem(
        11,
        at,
        `\`<${name} />\` does not self-close in HTML: the browser opens \`<${name}>\` and never closes it. Write \`<${name}></${name}>\``,
      );
    }
    // Would this tag close the open element for us, as in `<li>a<li>b` or `<p>text<div>`? The browser allows
    // it; this audit wants the end tag written. Report it, then do what the browser does.
    while (stack.length) {
      const top = stack[stack.length - 1]!;
      const rule = CLOSES[top];
      if (!rule || !(rule.direct ?? rule.descendant ?? []).includes(name)) break;
      problem(
        9,
        openedAt[openedAt.length - 1]!,
        `\`<${top}>\` is never closed: \`<${name}>\` starts before its \`</${top}>\``,
      );
      pop();
    }
    // Is this tag allowed where it is? Custom elements may hold anything, and a
    // <template>'s contents are a separate tree, so both stop the search.
    if (!name.includes('-')) {
      for (let k = stack.length - 1; k >= 0; k--) {
        const anc = stack[k]!;
        if (anc.includes('-') || anc === 'template') break;
        const rule = DISALLOWED[anc];
        if (!rule) continue;
        if (rule.resetBy?.some((r) => stack.includes(r, k + 1))) continue; // a <dl> between a <dd> and a <dt> resets the rule
        const parent = k === stack.length - 1;
        if (
          (parent && ((rule.only && !rule.only.includes(name)) || rule.direct?.includes(name))) ||
          rule.descendant?.includes(name)
        ) {
          problem(
            13,
            at,
            `\`<${name}>\` cannot be ${parent ? 'a child of' : 'inside'} \`<${anc}>\`: the browser would move it, or close \`<${anc}>\` early`,
          );
          break;
        }
      }
    }
    // Everything the browser would have closed is closed by now, so the ancestors are the real ones.
    enter(name, attrMap, at);
    push(name, at);
  };

  // An end tag was read.
  const close = (name: string, at: number) => {
    if (!foreign() && VOID.has(name)) {
      problem(
        12,
        at,
        `\`</${name}>\`: void elements have no end tag${name === 'br' ? '; the browser inserts a second <br>' : '; the browser ignores it'}`,
      );
      return;
    }
    const k = stack.lastIndexOf(name); // the element this closes, if it is open at all
    if (k < 0) {
      problem(10, at, `\`</${name}>\` closes nothing`);
      return;
    }
    // Everything opened after it is still open, and every end tag must be written.
    if (k < stack.length - 1) {
      const inner = stack[stack.length - 1]!;
      problem(10, at, `\`</${name}>\` closes \`<${inner}>\`: expected \`</${inner}>\` first`);
    }
    while (stack.length > k) pop();
  };

  // The main loop: the text up to the next tag, then the tag, handed to open() or close().
  let i = 0;
  while (i < n) {
    MARKUP.lastIndex = i;
    const next = MARKUP.exec(text)?.index ?? n;
    if (next > i) {
      onText(i, next);
      i = next;
      continue;
    }
    const at = i;
    if (text.startsWith('<!--', i)) {
      // A comment: skip to its end.
      const e = text.indexOf('-->', i + 4);
      i = e < 0 ? n : e + 3;
      continue;
    }
    if (text[i + 1] === '!' || text[i + 1] === '?') {
      // <!doctype> and the like: skip to the `>`.
      const e = text.indexOf('>', i);
      i = e < 0 ? n : e + 1;
      continue;
    }
    const closing = text[i + 1] === '/';
    let j = i + (closing ? 2 : 1);
    // Read the tag name. MARKUP matched, so it starts with a letter.
    const nameStart = j;
    while (j < n && !/[\s/>]/.test(text[j]!)) j++;
    const name = lower.slice(nameStart, j);
    // Read the attributes, up to the `>`.
    const attrMap = new Map<string, string>(); // this tag's attributes, for the rule set
    const seen = new Set<string>(); // attribute names on this tag, to spot duplicates
    let selfClosing = false;
    let done = false; // did we reach the `>`?
    while (j < n && !done) {
      const ch = text[j]!;
      if (WS.test(ch)) j++;
      else if (ch === '>') {
        done = true;
        j++;
      } else if (ch === '/') {
        if (text[j + 1] === '>') {
          selfClosing = true;
          done = true;
          j += 2;
        } else j++; // a stray `/`, which the browser ignores
      } else if (text.startsWith(EXPRESSION, j)) j += EXPRESSION.length; // a `${…}` in the tag: attributes we cannot see
      else if (ch === '<') {
        problem(
          8,
          at,
          `\`<\` inside \`<${closing ? '/' : ''}${name} …\`: the tag was never closed with \`>\`, so the browser reads \`<…\` as an attribute name`,
        );
        done = true; // start over at this `<`
      } else {
        // An attribute name, then maybe an `=` and a value.
        let k = j;
        while (k < n && !/[\s/>=]/.test(text[k]!)) k++;
        const attr = lower.slice(j, k);
        if (/["']/.test(attr)) {
          problem(8, at, `a quote inside the attribute name \`${text.slice(j, k)}\` on \`<${name}>\`: missing \`=\`?`);
        }
        if (seen.has(attr)) problem(14, at, `\`${attr}\` appears twice on \`<${name}>\`: the browser keeps the first`);
        seen.add(attr);
        if (visit) attrMap.set(attr, '');
        j = k;
        while (j < n && WS.test(text[j]!)) j++;
        if (text[j] === '=') {
          j++;
          while (j < n && WS.test(text[j]!)) j++;
          const q = text[j];
          let value: string;
          if (q === '"' || q === "'") {
            // A quoted value: everything up to the matching quote.
            const e = text.indexOf(q, j + 1);
            value = text.slice(j + 1, e < 0 ? n : e);
            j = e < 0 ? n : e + 1;
          } else {
            // An unquoted value: everything up to whitespace or `>`.
            let e = j;
            while (e < n && !/[\s>]/.test(text[e]!)) e++;
            value = text.slice(j, e);
            j = e;
          }
          if (visit) attrMap.set(attr, value);
          // A URL the guard replaced. Only a rendered page can have one, so only `check()` reports it.
          if (page && value === BLOCKED)
            problem(19, at, `${attr}="${BLOCKED}": the URL guard blocked this value's scheme`);
          // Remember ids and id references for the check at the end.
          if ((ids || visit) && !closing && !value.includes(EXPRESSION)) {
            if (attr === 'id') {
              if (idAt.has(value)) {
                if (ids) problem(16, at, `id "${value}" is used twice`);
              } else idAt.set(value, at);
            } else if (ids && IDREFS.has(attr)) {
              for (const ref of value.split(/\s+/)) if (ref) refs.push([attr, ref, at]);
            }
          }
        }
      }
    }
    if (!done) problem(8, at, `\`<${closing ? '/' : ''}${name}\` is never closed with \`>\``); // ran out of markup inside the tag
    i = j;
    if (closing) close(name, at);
    else {
      open(name, at, selfClosing, attrMap);
      // Inside <script>, <style>, <textarea> or <title>, jump straight to the end tag: `</script` and
      // then whitespace, `/` or `>`. A `</scripts>` does not end a script.
      if (!foreign() && RAW.has(name) && !selfClosing) {
        let e = lower.indexOf(`</${name}`, i);
        while (e >= 0 && !/[\s/>]/.test(lower[e + name.length + 2] ?? '>')) e = lower.indexOf(`</${name}`, e + 1);
        const stop = e < 0 ? n : e;
        onText(i, stop);
        i = stop;
      }
    }
  }

  // The end. Anything still open is an error, unless its end tag is optional.
  for (let m = stack.length - 1; m >= 0; m--) {
    const name = stack[m]!;
    problem(9, openedAt[m]!, `\`<${name}>\` is never closed`);
  }
  visit?.end?.(idAt);
  // Every id reference must point at an id that exists.
  if (ids) {
    for (const [attr, id, at] of refs) {
      if (!idAt.has(id)) problem(15, at, `${attr}="${id}" refers to an id that is not in the markup`);
    }
  }
};

/**
 * The audit for one template. Stops at the first problem.
 *
 * @throws {HtmlError} codes 8 to 14, with the markup around the problem in the message
 * @internal
 */
export const auditTemplate = (chunks: readonly string[]): void =>
  audit(chunks, (found) => {
    const p = found as Problem;
    const hatch = p.code === 9 || p.code === 10 ? '; a deliberately unmatched tag belongs in raw()' : '';
    throw new HtmlError(p.code, `${p.message}${hatch}, near "${p.near}"`);
  });
