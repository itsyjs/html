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
//
// itsy-html-spec's tree.test.ts checks the walk against parse5. Over the html5lib parser suite:
// when the audit reports nothing, the tree it hands a rule set is the one parse5 builds. Over
// generated nestings: it reports a problem exactly when parse5 changes what is written.
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
   * A start tag, with its attributes and the elements it sits inside, outermost first. The rule
   * set may keep both: the walk carries on with its own copies.
   */
  open?: (tag: string, attrs: ReadonlyMap<string, string>, at: number, ancestors: readonly string[]) => void;
  /**
   * A run of text, as written, with the elements it sits inside, outermost first. A run is
   * everything between two tags, comments or doctypes, so `TO<!-- -->DO` arrives as two, or the
   * whole body of an element the browser reads as text: `<script>`, `<style>`, `<textarea>`,
   * `<title>`, `<iframe>`, `<noscript>`, `<noembed>`, `<noframes>`, `<xmp>` and `<plaintext>`.
   * Never empty. Entities are not decoded, and a `<` that opens no tag is text, as the browser
   * reads it.
   */
  text?: (content: string, at: number, ancestors: readonly string[]) => void;
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

// Stands in for a `${…}` when a template is audited. Inside a tag it means attributes the audit
// cannot see.
const EXPRESSION = '${…}';

const set = (names: string) => new Set(names.split(' '));

/**
 * Elements that never have content or an end tag. The last four are obsolete, but the parser still
 * treats them as void, so an end tag for one is still a mistake.
 * @internal
 */
export const VOID = set(
  'area base br col embed hr img input link meta param source track wbr basefont bgsound frame keygen',
);
// Elements whose content the browser reads as text up to the end tag, so a `<` inside them is not a
// tag. `<noscript>` is read as a browser with scripting on reads it, which is every shipping
// browser. `<plaintext>` has no end tag at all: everything after it is text.
const RAW = set('script style textarea title iframe noembed noframes noscript xmp');
// Inside these, `/>` does self-close, and the HTML nesting rules do not apply.
const FOREIGN = set('svg math');
// Where SVG and MathML hand their content back to HTML, with its nesting rules and void elements.
// `<annotation-xml>` is one too, but only when its encoding says HTML; that is decided per element.
const POINTS = set('foreignobject desc title mi mo mn ms mtext');
// HTML tags that end SVG or MathML wherever they appear inside it: the browser closes the foreign
// content and starts the tag as HTML. `<font>` is one only with `color`, `face` or `size`.
const BREAKOUT = set(
  'b big blockquote body br center code dd div dl dt em embed h1 h2 h3 h4 h5 h6 head hr i img li listing menu meta nobr ol p pre ruby s small span strong strike sub sup table tt u ul var',
);
// What the browser moves back into the head when it comes after `</head>`.
const HEADISH = set('base basefont bgsound link meta noframes script style template title');
// Elements that cannot hold text themselves: the browser moves it out, in front of the table.
const FOSTER = set('table tbody thead tfoot tr colgroup');
// The tags that only mean something inside a table. Anywhere else the browser ignores them.
const TABLE_PARTS = set('caption col colgroup tbody td tfoot th thead tr');
// The elements a table part may start inside: the table's own, and a <template>, whose content
// can be a piece of a table.
const TABLE_CONTEXT = set('table caption colgroup tbody thead tfoot tr td th template');
// The elements an implied end tag closes: the ones whose end tag the spec makes optional.
const IMPLIED = set('dd dt li optgroup option p rb rp rt rtc');
// Where the parser stops looking for an element "in scope": the edges of a table cell, an object,
// a template, and the places SVG and MathML hand their content back to HTML.
const SCOPE = set(
  'applet caption html table td th marquee object template annotation-xml foreignobject desc title mi mo mn ms mtext',
);
// The parser's "special" elements, less `address`, `div` and `p`: a new <li>, <dd> or <dt> closes
// the one open before it unless one of these sits in between.
const SPECIAL = set(
  'applet area article aside base basefont bgsound blockquote body br button caption center col colgroup dd details dir dl dt embed fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hgroup hr html iframe img input keygen li link listing main marquee menu meta nav noembed noframes noscript object ol param plaintext pre script search section select source style summary table tbody td template textarea tfoot th thead title tr track ul wbr xmp mi mo mn ms mtext annotation-xml foreignobject desc',
);

interface Rule {
  /** Tags that may not be a direct child. */
  direct?: string[];
  /** Tags that may not appear anywhere inside. */
  descendant?: string[];
  /** The only tags allowed as direct children. */
  only?: string[];
  /** If one of these sits in between, the `descendant` rule no longer applies. */
  resetBy?: ReadonlySet<string>;
  /** Tags that close it only inside a `<select>`. */
  select?: string[];
}

const H = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
const T = ['style', 'script', 'template'];
const DT: Rule = { descendant: ['dt', 'dd'], resetBy: SPECIAL };
// A <button> is as far as the parser looks for an open <p>; an <object>, a cell or a <marquee> is as
// far as it looks for an open <a>, which it has to split around the new one.
const BUTTON_SCOPE = new Set([...SCOPE, 'button']);
const MARKERS = set('applet object marquee td th caption');
// Inside a table, a table part starting closes what it cannot sit in, up to the table itself.
const IN_TABLE = set('table');
const CELL: Rule = { descendant: [...TABLE_PARTS], resetBy: IN_TABLE };
const SECTION: Rule = { direct: ['caption', 'col', 'colgroup', 'tbody', 'thead', 'tfoot'] };

// Elements the browser closes by itself when one of the listed tags starts. The spec makes their
// end tags optional; the audit reports them anyway, so a template reads as it parses. The lists
// are the parser's, which closes more than the spec's list of optional end tags.
const CLOSES: Record<string, Rule> = {
  li: { direct: ['li'] },
  dt: DT,
  dd: DT,
  p: {
    descendant: [
      ...'address article aside blockquote center details dialog dir div dl dd dt fieldset'.split(' '),
      ...'figcaption figure footer form header hgroup hr li listing main menu nav'.split(' '),
      ...H,
      ...'ol p plaintext pre search section summary table ul xmp'.split(' '),
    ],
    resetBy: BUTTON_SCOPE,
  },
  optgroup: { select: ['optgroup', 'hr'] },
  option: { direct: ['option', 'optgroup'], select: ['hr'] },
  caption: CELL,
  thead: SECTION,
  tbody: SECTION,
  tfoot: SECTION,
  tr: { direct: ['caption', 'col', 'colgroup', 'tbody', 'thead', 'tfoot', 'tr'] },
  td: CELL,
  th: CELL,
};

// Children the browser moves somewhere else, splits, or drops.
const DISALLOWED: Record<string, Rule> = {
  ...CLOSES,
  // A new <li> closes the one before it unless a list or another special element sits between.
  li: { descendant: ['li'], resetBy: SPECIAL },
  form: { descendant: ['form'] },
  a: { descendant: ['a'], resetBy: MARKERS },
  button: { descendant: ['button'], resetBy: SCOPE },
  nobr: { descendant: ['nobr'], resetBy: SCOPE },
  // A second <select>, or a control that cannot sit in one, closes the <select> first.
  select: { descendant: ['select', 'input', 'keygen', 'textarea'] },
  // A heading closes one it starts in, but only as its direct child.
  ...Object.fromEntries(H.map((h) => [h, { direct: H }])),
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
const IDREFS = set(
  'for form list headers popovertarget commandfor itemref aria-labelledby aria-describedby aria-controls aria-owns aria-details aria-errormessage aria-flowto aria-activedescendant',
);

// Whitespace as HTML reads it. Not JavaScript's `\s`: a vertical tab or a no-break space is part
// of a name or a value to the browser, never a gap between them.
const WS = /[\t\n\f\r ]/;
// Text the parser has to put somewhere: anything but the ASCII whitespace it passes over.
const INK = /[^\t\n\f\r ]/;
// Where markup starts: `<` before a letter, `!` or `?`, or `</` before anything at all. The
// browser reads any other `<` as text, and so does the audit.
const MARKUP = /<[a-z!?]|<\/./gis;
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
  // `İ` (the Turkish dotted capital I) returns two characters, and every offset after it
  // would then be wrong. The HTML parser lowercases only ASCII in names too.
  const lower = text.replace(/[A-Z]/g, (c) => c.toLowerCase());
  const n = text.length;
  const near = (at: number) => text.slice(Math.max(0, at - 40), at + 30).replace(/\s+/g, ' ');
  const problem = (code: number, at: number, message: string) => report({ code, message, at, near: near(at) });
  // The rule set, if any, reports into the same list.
  const visit = ruleSet?.((r, message, at) => report({ rule: r, message, at, near: near(at) }));

  const stack: string[] = []; // the elements currently open, outermost first
  const openedAt: number[] = []; // where each of them started
  const held: boolean[] = []; // did each of them hold any text
  const points: boolean[] = []; // does each of them hand its content back to HTML (see POINTS)
  const idAt = new Map<string, number>(); // every id seen, and where
  const refs: [attr: string, id: string, at: number][] = []; // every id reference, checked at the end
  // Where the document is: the browser files what comes after `</head>` or `</body>` elsewhere.
  let started = false; // has any element started yet? After one, an `<html>` tag is too late
  let headDone = false;
  let ended = ''; // `body` or `html` once that end tag has closed the document's content

  const push = (name: string, at: number, attrMap: ReadonlyMap<string, string>) => {
    stack.push(name);
    openedAt.push(at);
    held.push(false);
    points.push(
      POINTS.has(name) ||
        (name === 'annotation-xml' && /^(text\/html|application\/xhtml\+xml)$/i.test(attrMap.get('encoding') ?? '')),
    );
  };
  const pop = () => {
    const from = openedAt.pop()!;
    const hadText = held.pop()!;
    const name = stack.pop()!;
    points.pop();
    if (name === 'head') headDone = true;
    if (name === 'html' || (name === 'body' && !ended)) ended = name;
    if (hadText && held.length) held[held.length - 1] = true; // text in a child is text in its parent
    visit?.close?.(name, from, hadText);
  };
  // A start tag, handed to the rule set. The ancestors go as a copy: the stack moves on, and a rule
  // set may keep what it was given.
  const enter = (name: string, attrMap: ReadonlyMap<string, string>, at: number) =>
    visit?.open?.(name, attrMap, at, stack.slice());
  // Is the current element SVG or MathML? The nearest integration point or foreign root decides:
  // inside a <foreignObject> the content is HTML again, with its nesting rules and its void elements.
  const foreign = (): boolean => {
    let k = stack.length - 1;
    while (k >= 0 && !points[k] && !FOREIGN.has(stack[k]!)) k--;
    return k >= 0 && !points[k];
  };
  // Is the parser in the part of the document after `</head>` and before `<body>`? A <body> that
  // has started is on the stack, or has ended and set `ended`, which is checked first.
  const afterHead = () => headDone && (stack.length === 0 || (stack.length === 1 && stack[0] === 'html'));
  // Is `name` open, with nothing between it and the current element that stops the parser looking?
  const inScope = (name: string): boolean => {
    let k = stack.length - 1;
    while (k >= 0 && stack[k] !== name && !SCOPE.has(stack[k]!)) k--;
    return k >= 0 && stack[k] === name;
  };

  // A run of text. The walk needs it for two things: text the browser moves (out of a table, out
  // of the head, back into the body), and whether an element held anything, for a rule set.
  const onText = (from: number, to: number) => {
    if (from === to) return;
    const parent = stack[stack.length - 1];
    const moved = !foreign() && (FOSTER.has(parent ?? '') || parent === 'head' || ended !== '');
    const run = text.slice(from, to);
    if (moved) {
      // The first character the parser has to put somewhere. A `${…}` is not text: in a template
      // it is whatever the value renders, rows and cells included.
      let k = 0;
      while (k < run.length && (run.startsWith(EXPRESSION, k) || !INK.test(run[k]!))) {
        k += run.startsWith(EXPRESSION, k) ? EXPRESSION.length : 1;
      }
      if (k < run.length) {
        problem(
          13,
          from + k,
          parent === 'head'
            ? 'text inside `<head>`: the browser ends the head there and moves the text into the body'
            : parent !== undefined && FOSTER.has(parent)
              ? `text directly inside \`<${parent}>\`: the browser moves it out, in front of the table`
              : `text after \`</${ended}>\`: the browser moves it into the body`,
        );
      }
    }
    if (!visit) return;
    if (held.length && run.trim()) held[held.length - 1] = true;
    visit.text?.(run, from, stack.slice());
  };
  // Where a <script> ends. `<!--` puts the tokenizer in its escaped state, and a `<script` inside
  // that in its double-escaped one, where a `</script>` is text rather than the end.
  // The search for `-->` starts inside the `<!--`, so `<!-->` ends the escape as the browser ends it.
  const scriptEnd = (from: number): number => {
    let state = 0; // 0: script data, 1: escaped, 2: double escaped
    let k = from;
    for (; k < n; k++) {
      if (lower.startsWith('-->', k)) state = 0;
      if (lower[k] !== '<') continue;
      if (state === 0 && lower.startsWith('<!--', k)) state = 1;
      else if (lower.startsWith('script', k + 1) && /[\t\n\f\r />]/.test(lower[k + 7] ?? '')) {
        if (state === 1) state = 2;
      } else if (lower.startsWith('/script', k + 1) && /[\t\n\f\r />]/.test(lower[k + 8] ?? '>')) {
        if (state === 2) state = 1;
        else break;
      }
    }
    return k; // the end tag, or the end of the markup when there is none
  };

  // A start tag was read. Returns whether it opened an HTML element that holds content, which is
  // what decides whether its body is text. `<script />` counts: the browser ignores the `/`.
  const open = (
    tag: string,
    at: number,
    selfClosing: boolean,
    attrMap: ReadonlyMap<string, string>,
    unseen: boolean,
  ) => {
    let name = tag;
    // A tag that ends SVG or MathML: report it, then do what the browser does — close the foreign
    // content and start the tag as HTML.
    if (
      foreign() &&
      (BREAKOUT.has(name) || (name === 'font' && (attrMap.has('color') || attrMap.has('face') || attrMap.has('size'))))
    ) {
      const root = [...stack].reverse().find((s) => FOREIGN.has(s))!;
      problem(
        13,
        at,
        `\`<${name}>\` cannot be inside \`<${root}>\`: the browser closes the \`<${root}>\` and starts \`<${name}>\` as HTML`,
      );
      while (foreign()) pop();
    }
    if (foreign()) {
      // Inside SVG or MathML there are no nesting rules, and `/>` works. A rule set still needs
      // the close, or a self-closing tag leaves it waiting for an element that never ends.
      enter(name, attrMap, at);
      if (selfClosing) visit?.close?.(name, at, false);
      else push(name, at, attrMap);
      return false;
    }
    // An <svg> or a <math> starts in HTML, so it is placed by HTML's rules like any other element.
    const root = FOREIGN.has(name);
    if (name === 'image') {
      problem(13, at, '`<image>` is not an HTML element: the browser reads it as `<img>`');
      name = 'img';
    }
    const isVoid = VOID.has(name);
    if (selfClosing && !isVoid && !root) {
      problem(
        11,
        at,
        `\`<${name} />\` does not self-close in HTML: the browser opens \`<${name}>\` and never closes it. Write \`<${name}></${name}>\``,
      );
    }
    // After `</head>` or `</body>` the browser files the element somewhere else.
    if (ended) problem(13, at, `\`<${name}>\` after \`</${ended}>\`: the browser moves it into the body`);
    else if (afterHead() && HEADISH.has(name)) {
      problem(13, at, `\`<${name}>\` after \`</head>\`: the browser moves it back into the head`);
    }
    // Tags the browser drops, or folds into an element it already has. A <template>'s contents are
    // a document fragment: there is no document for these to start.
    if ((name === 'html' || name === 'head' || name === 'body') && stack.includes('template')) {
      problem(13, at, `\`<${name}>\` inside \`<template>\`: the browser ignores the tag`);
    } else if (name === 'html' && started) {
      problem(
        13,
        at,
        '`<html>` after the page has started: the browser adds its attributes to the first and drops the tag',
      );
    } else if (name === 'body' && stack.some((e) => e !== 'html' && e !== 'head')) {
      problem(13, at, '`<body>` inside the body: the browser adds its attributes to the first and drops the tag');
    } else if (name === 'head' && (headDone || stack.some((e) => e !== 'html'))) {
      problem(13, at, '`<head>` after the head: the browser drops the tag');
    } else if (TABLE_PARTS.has(name) && stack.length) {
      // The nearest table part, <template> or custom element decides. If there is none, or it is a
      // <template> with something else in between, the parser is reading body content, where a
      // table part means nothing.
      let k = stack.length - 1;
      while (k >= 0 && !TABLE_CONTEXT.has(stack[k]!) && !stack[k]!.includes('-')) k--;
      if (k < 0 || (stack[k] === 'template' && k < stack.length - 1)) {
        problem(13, at, `\`<${name}>\` outside a table: the browser drops the tag`);
      }
    }
    // Does this tag close the open element, as in `<li>a<li>b` or `<p>text<div>`? The browser
    // allows it; the audit wants the end tag written. Report it, then do what the browser does.
    // Inside a <ruby>, an annotation closes every element with an optional end tag, as an implied
    // end tag does. An <rt> or <rp> leaves an <rtc> open, since an <rtc> may hold them.
    const annotation = /^r(b|p|t|tc)$/.test(name) && inScope('ruby');
    while (stack.length) {
      const top = stack[stack.length - 1]!;
      const rule = CLOSES[top];
      const implied = annotation && IMPLIED.has(top) && !(top === 'rtc' && (name === 'rt' || name === 'rp'));
      const closes =
        rule &&
        ((rule.direct ?? rule.descendant ?? []).includes(name) ||
          (rule.select?.includes(name) && stack.includes('select')));
      if (!implied && !closes) break;
      problem(
        9,
        openedAt[openedAt.length - 1]!,
        `\`<${top}>\` is never closed: \`<${name}>\` starts before its \`</${top}>\``,
      );
      pop();
    }
    // A hidden <input> is the one element a table keeps where it is written. Attributes the audit
    // cannot see might make it one.
    const type = attrMap.get('type');
    const hidden = name === 'input' && (unseen || /^hidden$/i.test(type ?? '') || !!type?.includes(EXPRESSION));
    // Is this tag allowed where it is? Custom elements may hold anything, and a
    // <template>'s contents are a separate tree, so both stop the search.
    if (!name.includes('-')) {
      for (let k = stack.length - 1; k >= 0; k--) {
        const anc = stack[k]!;
        if (anc.includes('-') || anc === 'template') break;
        const rule = DISALLOWED[anc];
        if (!rule) continue;
        // A <dl> between a <dd> and a <dt> resets the rule, as a <table> between a cell and a row does.
        if (rule.resetBy && stack.slice(k + 1).some((e) => rule.resetBy!.has(e))) continue;
        const parent = k === stack.length - 1;
        const outside = rule.only && !rule.only.includes(name) && !(hidden && FOSTER.has(anc));
        if ((parent && (outside || rule.direct?.includes(name))) || rule.descendant?.includes(name)) {
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
    // Void elements like <br> and <img> never open anything, but a rule still sees them.
    started = true;
    enter(name, attrMap, at);
    if (isVoid) return false;
    if (root && selfClosing) {
      visit?.close?.(name, at, false); // `<svg/>` is whole, as it is inside SVG
      return false;
    }
    push(name, at, attrMap);
    return !root; // what is inside SVG or MathML is markup, never raw text
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
      // A comment. `<!-->` and `<!--->` are whole comments; any other ends at the first `-->` or
      // `--!>`, and one that never ends runs to the end of the markup.
      if (text[i + 4] === '>') i += 5;
      else if (text.startsWith('->', i + 4)) i += 6;
      else {
        const a = text.indexOf('-->', i + 4);
        const b = text.indexOf('--!>', i + 4);
        i = b >= 0 && (a < 0 || b < a) ? b + 4 : a >= 0 ? a + 3 : n;
      }
      continue;
    }
    if (text.startsWith('<![CDATA[', i) && foreign()) {
      // Inside SVG and MathML a CDATA section is text, `<` and `>` included, up to `]]>`.
      const e = text.indexOf(']]>', i + 9);
      onText(i + 9, e < 0 ? n : e);
      i = e < 0 ? n : e + 3;
      continue;
    }
    const closing = text[i + 1] === '/';
    if (text[i + 1] === '!' || text[i + 1] === '?' || (closing && !/[a-z]/i.test(text[i + 2] ?? ''))) {
      // <!doctype> and the like, or an end tag with no name: the browser makes `</ x>` a comment
      // and drops `</>` altogether. Either way, skip to the `>`.
      const e = text.indexOf('>', i);
      i = e < 0 ? n : e + 1;
      continue;
    }
    let j = i + (closing ? 2 : 1);
    // Read the tag name. Everything that reaches here starts with a letter.
    const nameStart = j;
    while (j < n && !/[\t\n\f\r />]/.test(text[j]!)) j++;
    const name = lower.slice(nameStart, j);
    // Read the attributes, up to the `>`.
    const attrMap = new Map<string, string>(); // this tag's attributes, as the browser keeps them
    const seen = new Set<string>(); // attribute names on this tag, to spot duplicates
    let selfClosing = false;
    let unseen = false; // did a `${…}` stand for attributes the audit cannot see?
    let done = false; // was the `>` reached?
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
      } else if (text.startsWith(EXPRESSION, j)) {
        unseen = true; // a `${…}` in the tag: attributes the audit cannot see
        j += EXPRESSION.length;
      } else if (ch === '<') {
        problem(
          8,
          at,
          `\`<\` inside \`<${closing ? '/' : ''}${name} …\`: the tag was never closed with \`>\`, so the browser reads \`<…\` as an attribute name`,
        );
        done = true; // start over at this `<`
      } else {
        // An attribute name, then maybe an `=` and a value. The first character always belongs to
        // the name, even a `=`: in `<a =x>` the browser reads an attribute called `=x`.
        let k = j + 1;
        while (k < n && !/[\t\n\f\r />=]/.test(text[k]!)) k++;
        const attr = lower.slice(j, k);
        if (/["']/.test(attr)) {
          problem(8, at, `a quote inside the attribute name \`${text.slice(j, k)}\` on \`<${name}>\`: missing \`=\`?`);
        }
        // The browser keeps the first of a repeated attribute and drops the rest, so a repeat is
        // reported and goes no further: no rule set sees it, its id counts for nothing, and a URL
        // the guard blocked in it is not reported, since the browser never uses it.
        const repeat = seen.has(attr);
        if (repeat) problem(14, at, `\`${attr}\` appears twice on \`<${name}>\`: the browser keeps the first`);
        seen.add(attr);
        if (!repeat) attrMap.set(attr, '');
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
            while (e < n && !/[\t\n\f\r >]/.test(text[e]!)) e++;
            value = text.slice(j, e);
            j = e;
          }
          if (repeat) continue;
          attrMap.set(attr, value);
          // A URL the guard replaced. Only a rendered page can have one, so only `check()` reports it.
          if (page && value === BLOCKED)
            problem(19, at, `${attr}="${BLOCKED}": the URL guard blocked this value's scheme`);
          // Remember ids and id references for the check at the end. An empty id is no id at all.
          if ((ids || visit) && !closing && !value.includes(EXPRESSION)) {
            if (attr === 'id') {
              if (idAt.has(value)) {
                if (ids) problem(16, at, `id "${value}" is used twice`);
              } else if (value) idAt.set(value, at);
            } else if (ids && IDREFS.has(attr)) {
              for (const ref of value.split(/[\t\n\f\r ]+/)) if (ref) refs.push([attr, ref, at]);
            }
          }
        }
      }
    }
    if (!done) problem(8, at, `\`<${closing ? '/' : ''}${name}\` is never closed with \`>\``); // ran out of markup inside the tag
    i = j;
    if (closing) close(name, at);
    else if (open(name, at, selfClosing, attrMap, unseen)) {
      if (name === 'plaintext') {
        onText(i, n); // no end tag ever ends it
        i = n;
      } else if (RAW.has(name)) {
        // Jump straight to the end tag: `</title` and then whitespace, `/` or `>`. A `</titles>`
        // does not end a title, and a <script> follows the tokenizer's escaped states.
        let e = name === 'script' ? scriptEnd(i) : lower.indexOf(`</${name}`, i);
        if (name !== 'script') {
          while (e >= 0 && !/[\t\n\f\r />]/.test(lower[e + name.length + 2] ?? '>'))
            e = lower.indexOf(`</${name}`, e + 1);
        }
        const stop = e < 0 ? n : e;
        onText(i, stop);
        i = stop;
      }
    }
  }

  // The end. Anything still open is an error, even an element whose end tag is optional.
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
