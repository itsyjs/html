// Accessibility rules for `check()`. They advise and never throw: the browser renders all of this
// markup exactly as written, and the people using the page pay for it.
//
// A rule fires only when it is sure. Reporting correct markup is worse than missing a bug: one
// wrong finding is enough for someone to turn the whole check off. So every borderline case below
// stays silent on purpose.
//
// The rule names and most of the reasoning come from Svelte's a11y pass (MIT), which took them
// from eslint-plugin-jsx-a11y.
//
// Two oracles in the itsy-html-spec repository hold this file to outside sources, so a review
// argues with a failing case, not an opinion. act.test.ts runs every example the W3C ACT Rules
// group publishes for these rules. tables.test.ts checks the tables below against aria-query,
// which is generated from ARIA and HTML-AAM. Every deliberate difference from either is listed
// there, with the reason.
//
// The tables are written out, not imported: aria-query and axobject-query are 10.9 kB brotli
// together, and this library has no dependencies. The tables cost nothing in production, where
// `check()` compiles this whole file away. One rule is still missing: "this `aria-*` is not
// allowed on this role". It needs the full role-to-properties graph, the largest table and the
// easiest to get wrong.
//
// Only `check()` reaches this file, inside its `__DEV__` branch.
import { type RuleSet, type Visitor, VOID } from './audit.ts';

type Attrs = ReadonlyMap<string, string>;
/**
 * How the rules here report: a `Report` whose rule name is checked against the closed union at the
 * end of this file. A typo in a rule name is a type error here, not an unknown name in the output.
 */
type A11yReport = (rule: A11yRule, message: string, at: number) => void;

const set = (names: string) => new Set(names.split(' '));

// The tables are exported only for itsy-html-spec's tables.test.ts.

/**
 * Every ARIA attribute name, without its `aria-` prefix. A name outside this list does nothing: no
 * browser or screen reader reads it. So a typo fails silently, and this list is what catches it.
 * @internal
 */
export const ARIA = /* @__PURE__ */ set(
  'activedescendant atomic autocomplete braillelabel brailleroledescription busy checked colcount colindex colindextext colspan controls current describedby description details disabled dropeffect errormessage expanded flowto grabbed haspopup hidden invalid keyshortcuts label labelledby level live modal multiline multiselectable orientation owns placeholder posinset pressed readonly relevant required roledescription rowcount rowindex rowindextext rowspan selected setsize sort valuemax valuemin valuenow valuetext',
);
/**
 * The true/false attributes and the values each takes: `undefined` where the spec lists it, and
 * `mixed` on the two tristates. Any other value reads as if the attribute were absent.
 * @internal
 */
export const BOOLEAN: Record<string, string> = {
  atomic: 'true false',
  busy: 'true false',
  checked: 'true false mixed undefined',
  disabled: 'true false',
  expanded: 'true false undefined',
  grabbed: 'true false undefined',
  hidden: 'true false undefined',
  modal: 'true false',
  multiline: 'true false',
  multiselectable: 'true false',
  pressed: 'true false mixed undefined',
  readonly: 'true false',
  required: 'true false',
  selected: 'true false undefined',
};
/**
 * The token attributes: the values each takes, and how the browser reads any other value.
 * `aria-current` and `aria-invalid` read an unknown value as `true`; the rest fall back to their
 * default. `aria-live` has its own rule, with its own consequence.
 * @internal
 */
export const TOKENS: Record<string, [values: string, fallback: string]> = {
  autocomplete: ['inline list both none', 'none'],
  current: ['page step location date time true false', 'true'],
  dropeffect: ['copy execute link move none popup', 'none'],
  haspopup: ['false true menu listbox tree grid dialog', 'false'],
  invalid: ['grammar false spelling true', 'true'],
  orientation: ['horizontal vertical undefined', 'undefined'],
  relevant: ['additions all removals text', 'additions text'],
  sort: ['ascending descending none other', 'none'],
};
/** @internal The two token attributes that take a space-separated list. */
export const LISTS = /* @__PURE__ */ set('dropeffect relevant');
/** @internal */
export const LIVE = /* @__PURE__ */ set('polite assertive off');
/** @internal The attributes that take a whole number. */
export const INTEGER = /* @__PURE__ */ set(
  'colcount colindex colspan level posinset rowcount rowindex rowspan setsize',
);
/** @internal The attributes that take any number. */
export const NUMBER = /* @__PURE__ */ set('valuemax valuemin valuenow');
/**
 * The global ARIA attributes, less `aria-hidden`. On an element that carries any of them, the
 * browser ignores `role="none"` and `role="presentation"`, as it does on anything focusable.
 * @internal
 */
export const GLOBALS = /* @__PURE__ */ set(
  'atomic braillelabel brailleroledescription busy controls current describedby description details dropeffect flowto grabbed keyshortcuts label labelledby live owns relevant roledescription',
);

// What a `<label>` can label, and what a `for` may point at.
const LABELABLE = /* @__PURE__ */ set('button input meter output progress select textarea');
// Form controls the keyboard reaches, unless they are disabled.
const CONTROL = /* @__PURE__ */ set('button select textarea input');
// `<input>` types that are not a field to fill in: a button of some kind, or nothing at all.
const NOT_A_FIELD = /* @__PURE__ */ set('hidden submit reset button image');
// `<input>` types whose `placeholder` counts as a last-resort name, as HTML-AAM has it.
const PLACEHOLDER = /* @__PURE__ */ set('text search url tel email password number');
// `<input>` types with no ARIA role. Every type not listed anywhere reads as text.
const NO_ROLE = /* @__PURE__ */ set('color date datetime-local file hidden month password time week');
// The roles ACT counts as form fields. The first five take their name from their content too.
const FIELD_ROLES = /* @__PURE__ */ set(
  'checkbox radio switch menuitemcheckbox menuitemradio combobox listbox searchbox slider spinbutton textbox',
);
const NAMED_BY_CONTENT = /* @__PURE__ */ set('checkbox radio switch menuitemcheckbox menuitemradio');
// Elements whose text is not read as part of the page.
const SILENT = /* @__PURE__ */ set('script style template noscript iframe noembed noframes');

const TEXT = /\S/;
const TRUE = /^\s*true\s*$/i;
const HIDDEN = /display\s*:\s*none|visibility\s*:\s*(hidden|collapse)/i;
const HEADING = /^h[1-6]$/;
// A tabindex the browser can read: an optional sign, then digits. The browser ignores the rest.
const TABINDEX = /^\s*[-+]?\d/;
// A tabindex that jumps ahead of the rest of the page: optional zeroes, then 1-9. `0`, `-1`, `0x2`
// and `.5` all read as zero or less, so they pass.
const AHEAD = /^\s*\+?0*[1-9]/;
// A tabindex the browser reads as zero or more. That puts the element in the tab order.
const INTAB = /^\s*\+?\d/;
// A `<select size>` the browser reads as more than one row. HTML's integer parsing applies, not
// `Number()`'s: `2px` is 2 and `1e3` is 1.
const ROWS = /^\s*\+?0*(?:[2-9]|[1-9]\d)/;
const WHOLE = /^[-+]?\d+$/;
const DECIMAL = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;
// An alt that is the file it came from: "IMG_1024.JPG", "photo-3.png", "dsc00042".
const FILENAME = /^\s*(\S+\.(jpe?g|png|gif|svg|webp|avif|bmp)|(img|dsc|image|photo|screenshot)[-_]?\d+)\s*$/i;

/**
 * Every role that may appear in markup: ARIA's (the 1.3 draft included), DPUB-ARIA's `doc-*` and
 * Graphics ARIA's `graphics-*`. Abstract roles (`widget`, `section`, `input`, …) are left out: they
 * exist only in the taxonomy and do nothing in markup.
 * @internal
 */
export const ROLES = /* @__PURE__ */ set(
  'alert alertdialog application article banner blockquote button caption cell checkbox code columnheader combobox comment complementary contentinfo definition deletion dialog directory document emphasis feed figure form generic grid gridcell group heading image img insertion link list listbox listitem log main mark marquee math menu menubar menuitem menuitemcheckbox menuitemradio meter navigation none note option paragraph presentation progressbar radio radiogroup region row rowgroup rowheader scrollbar search searchbox sectionfooter sectionheader separator slider spinbutton status strong subscript suggestion superscript switch tab table tablist tabpanel term textbox time timer toolbar tooltip tree treegrid treeitem ' +
    'doc-abstract doc-acknowledgments doc-afterword doc-appendix doc-backlink doc-biblioentry doc-bibliography doc-biblioref doc-chapter doc-colophon doc-conclusion doc-cover doc-credit doc-credits doc-dedication doc-endnote doc-endnotes doc-epigraph doc-epilogue doc-errata doc-example doc-footnote doc-foreword doc-glossary doc-glossref doc-index doc-introduction doc-noteref doc-notice doc-pagebreak doc-pagefooter doc-pageheader doc-pagelist doc-part doc-preface doc-prologue doc-pullquote doc-qna doc-subtitle doc-tip doc-toc ' +
    'graphics-document graphics-object graphics-symbol',
);

/**
 * DPUB roles that are a kind of link or image, plus `image`, ARIA 1.3's synonym for `img`. Rules
 * that want a name from a link or an image want one from these too.
 * @internal
 */
export const KIND: Record<string, string> = {
  'doc-backlink': 'link',
  'doc-biblioref': 'link',
  'doc-glossref': 'link',
  'doc-noteref': 'link',
  'doc-cover': 'img',
  image: 'img',
};
// Roles that make an SVG element an image, named by its own `<title>` child.
const GRAPHIC = /* @__PURE__ */ set('img graphics-document graphics-symbol');

/**
 * The state a role cannot be read without. Only what ARIA 1.3 requires outright is here: a rule
 * that fires on correct markup is worse than one that misses. `separator` needs `aria-valuenow`
 * only when focusable, which `checkRole` settles from the markup.
 * @internal
 */
export const REQUIRED: Record<string, string> = {
  checkbox: 'aria-checked',
  combobox: 'aria-expanded',
  heading: 'aria-level',
  menuitemcheckbox: 'aria-checked',
  menuitemradio: 'aria-checked',
  meter: 'aria-valuenow',
  radio: 'aria-checked',
  scrollbar: 'aria-valuenow',
  slider: 'aria-valuenow',
  switch: 'aria-checked',
};

/**
 * The role each tag carries on its own, for the tags that settle it alone. itsy-html-spec's
 * tables.test.ts lists the tags left out, and why: an ancestor decides some, and CSS can strip the
 * role from others, so restating it puts it back (`<ul role="list">`). Tags whose own attributes
 * settle it (`<a>`, `<img>`, `<input>`, `<select>`) are handled in `implicitRole` below.
 * @internal
 */
export const IMPLICIT: Record<string, string> = {
  address: 'group',
  article: 'article',
  b: 'generic',
  bdi: 'generic',
  bdo: 'generic',
  blockquote: 'blockquote',
  button: 'button',
  code: 'code',
  data: 'generic',
  datalist: 'listbox',
  dd: 'definition',
  del: 'deletion',
  details: 'group',
  dfn: 'term',
  dialog: 'dialog',
  div: 'generic',
  dt: 'term',
  em: 'emphasis',
  fieldset: 'group',
  figure: 'figure',
  form: 'form',
  hgroup: 'group',
  hr: 'separator',
  i: 'generic',
  ins: 'insertion',
  main: 'main',
  mark: 'mark',
  math: 'math',
  meter: 'meter',
  nav: 'navigation',
  optgroup: 'group',
  output: 'status',
  p: 'paragraph',
  pre: 'generic',
  progress: 'progressbar',
  q: 'generic',
  samp: 'generic',
  search: 'search',
  small: 'generic',
  span: 'generic',
  strong: 'strong',
  sub: 'subscript',
  sup: 'superscript',
  textarea: 'textbox',
  time: 'time',
  u: 'generic',
};

/**
 * `<input>` types whose role holds whatever else is on the tag. The text-like types are handled in
 * `implicitRole`: with a `list`, they are a combobox only when it points at a `<datalist>`.
 * @internal
 */
export const INPUT: Record<string, string> = {
  button: 'button',
  checkbox: 'checkbox',
  image: 'button',
  number: 'spinbutton',
  radio: 'radio',
  range: 'slider',
  reset: 'button',
  submit: 'button',
};

/**
 * The state an `<input>` reports for itself, whatever role it is given: checkedness for a checkbox
 * or radio, the value for a range or number. `<input type="checkbox" role="switch">` is the native
 * switch, and ARIA in HTML forbids the `aria-checked` a rule would otherwise ask for.
 * @internal
 */
export const NATIVE: Record<string, string> = {
  checkbox: 'aria-checked',
  number: 'aria-valuenow',
  radio: 'aria-checked',
  range: 'aria-valuenow',
};

/** An `<input>`'s type as the browser reads it: any case, no trimming, so `" checkbox"` is text. */
const inputType = (a: Attrs) => (a.get('type') ?? '').toLowerCase();

/**
 * The state an `<input>` reports for itself. A text input with a `list` is already a combobox that
 * shows and hides its own suggestions, so it covers `aria-expanded`. A type with its own state
 * reports that state instead, whatever `list` says.
 */
const nativeState = (a: Attrs): string | undefined =>
  NATIVE[inputType(a)] ?? (a.has('list') ? 'aria-expanded' : undefined);

/** Can the keyboard tab to this element, going only by its own markup? */
const focusable = (tag: string, a: Attrs) => {
  const t = a.get('tabindex');
  if (t !== undefined && TABINDEX.test(t)) return INTAB.test(t); // a tabindex the browser can read decides
  if (tag === 'a' || tag === 'area') return a.has('href') || a.has('xlink:href');
  if (tag === 'audio' || tag === 'video') return a.has('controls');
  if (tag === 'summary' || tag === 'iframe') return true;
  if (/^(|true|plaintext-only)$/i.test(a.get('contenteditable') ?? 'false')) return true;
  return CONTROL.has(tag) && !a.has('disabled') && !(tag === 'input' && inputType(a) === 'hidden');
};

/** The first global ARIA attribute on the element, if it has one. */
const global = (a: Attrs) => [...a.keys()].find((k) => k.startsWith('aria-') && GLOBALS.has(k.slice(5)));
/** Does the browser ignore a presentational role here? It does on anything focusable or with a global ARIA attribute. */
const conflicted = (tag: string, a: Attrs) => focusable(tag, a) || global(a) !== undefined;

/** The first token of `role` the browser knows, lowercased, with `presentation` read as its synonym `none`. */
const explicitRole = (a: Attrs): string | undefined => {
  // Splitting on whitespace leaves an empty token for any at either end, and no role is empty.
  const known = (a.get('role') ?? '')
    .toLowerCase()
    .split(/\s+/)
    .find((t) => ROLES.has(t) || t === 'text');
  return known === 'presentation' ? 'none' : known;
};

/** The role this element has without a `role` attribute, when the markup alone settles it. */
const implicitRole = (tag: string, a: Attrs): string | undefined => {
  if (HEADING.test(tag)) return 'heading';
  if (tag === 'a' || tag === 'area') return a.has('href') ? 'link' : undefined;
  // `alt=""` is how an image says it is decoration — unless the browser has to ignore it.
  if (tag === 'img') return a.get('alt') === '' && !conflicted(tag, a) ? 'none' : 'img';
  if (tag === 'input') {
    const type = inputType(a);
    if (INPUT[type]) return INPUT[type];
    if (NO_ROLE.has(type)) return undefined;
    // Text, search, and every unknown type, which the browser reads as text. A `list` makes it a
    // combobox, but only when it points at a <datalist>, which this cannot see.
    if (a.has('list')) return undefined;
    return type === 'search' ? 'searchbox' : 'textbox';
  }
  // A `<select>` is a listbox when it shows more than one row, and a combobox otherwise. Both
  // cases matter: otherwise `<select role="combobox">` is reported as missing the `aria-expanded`
  // that the element reports for itself.
  if (tag === 'select') return a.has('multiple') || ROWS.test(a.get('size') ?? '') ? 'listbox' : 'combobox';
  return IMPLICIT[tag];
};

/**
 * The role the browser gives the element, as far as the markup settles it. `role="none"` counts
 * only where the browser honours it. WebKit's `role="text"` works in WebKit alone, so an element
 * with it has no role anyone can be sure of.
 */
const roleOf = (tag: string, a: Attrs): string | undefined => {
  const explicit = explicitRole(a);
  if (explicit === 'text') return undefined;
  if (explicit === 'none') return conflicted(tag, a) ? implicitRole(tag, a) : 'none';
  return explicit ?? implicitRole(tag, a);
};

// Rules that wait for an element to close before they can say anything.
type Waiting =
  | 'empty-heading'
  | 'empty-link'
  | 'empty-button'
  | 'empty-title'
  | 'img-alt'
  | 'field-label'
  | 'label-control';

const why: Record<Exclude<Waiting, 'label-control'>, string> = {
  'empty-heading': 'a screen reader announces a heading and then reads nothing',
  'empty-link': 'a screen reader reads out the URL instead',
  'empty-button': 'a screen reader says only "button"',
  'empty-title': 'the tab, the bookmark and the first thing a screen reader reads are all blank',
  'img-alt': 'a screen reader announces an image and nothing else. Give it a `<title>` or an `aria-label`',
  'field-label': 'a screen reader announces the control and nothing else',
};

/** Does it carry a non-empty name of its own? */
const names = (tag: string, a: Attrs) =>
  TEXT.test(a.get('aria-label') ?? '') ||
  TEXT.test(a.get('aria-labelledby') ?? '') ||
  TEXT.test(a.get('title') ?? '') ||
  (tag === 'img' && TEXT.test(a.get('alt') ?? ''));

/** Reports what is wrong with an element's `role`, if anything. */
const checkRole = (report: A11yReport, tag: string, a: Attrs, at: number) => {
  const role = (a.get('role') ?? '').trim();
  if (!role) return; // an empty `role` is `aria-empty`'s
  // `role` takes a list, and the browser uses the first entry it knows.
  const known = explicitRole(a);
  if (!known) {
    return report(
      'role-unknown',
      `\`role="${role}"\` is not an ARIA role: the browser ignores it, so \`<${tag}>\` keeps the role it already had`,
      at,
    );
  }
  // WebKit's `text`, for VoiceOver, is known, so it is not reported above. No element has it
  // implicitly, and no check below applies to it. The browser does not ignore it, so this passes.
  if (known === implicitRole(tag, a)) {
    const already = known === 'none' ? 'decoration' : `a \`${known}\``;
    return report(
      'role-redundant',
      `\`<${tag} role="${role}">\`: \`<${tag}>\` is already ${already}, so the attribute says nothing the browser did not know`,
      at,
    );
  }
  if (known === 'none' && conflicted(tag, a)) {
    const attr = global(a);
    return report(
      'role-presentation-conflict',
      focusable(tag, a)
        ? `\`<${tag} role="${role}">\` can still be tabbed to: the browser drops a presentational role from anything focusable, so this does nothing`
        : `\`<${tag} role="${role}">\` has \`${attr}\`: the browser drops a presentational role from anything with a global ARIA attribute, so this does nothing`,
      at,
    );
  }
  // A custom element can carry the state through ElementInternals, which the markup never shows.
  if (tag.includes('-')) return;
  // The state the role needs, unless the element supplies it. An element that already had the
  // role reports its own (the return above), and so does an `<input>` with the state built in.
  const need = REQUIRED[known] ?? (known === 'separator' && focusable(tag, a) ? 'aria-valuenow' : undefined);
  if (need && !a.has(need) && !(tag === 'input' && nativeState(a) === need)) {
    // Only a heading has a fallback: browsers read it as level 2.
    const outcome =
      known === 'heading'
        ? 'a screen reader announces it as level 2, whatever level it is'
        : 'a screen reader announces the role and then has no state to read';
    report('role-required-props', `\`role="${known}"\` has no \`${need}\`: ${outcome}`, at);
  }
};

/** Reports the `aria-*` attributes whose value the browser cannot use, and an empty `role`. */
const checkValues = (report: A11yReport, a: Attrs, at: number) => {
  for (const [name, value] of a) {
    const v = value.trim();
    const lower = v.toLowerCase();
    if (name === 'role' && !v) {
      report('aria-empty', '`role=""` does nothing: an empty value reads the same as leaving the attribute out', at);
    }
    if (!name.startsWith('aria-')) continue;
    const key = name.slice(5);
    const token = TOKENS[key];
    if (!ARIA.has(key)) {
      report(
        'aria-unknown',
        `\`${name}\` is not an ARIA attribute: no browser and no screen reader reads it, so it does nothing`,
        at,
      );
    } else if (!v) {
      report(
        'aria-empty',
        `\`${name}=""\` does nothing: an empty value reads the same as leaving the attribute out`,
        at,
      );
    } else if (BOOLEAN[key] && !BOOLEAN[key].split(' ').includes(lower)) {
      const takes = BOOLEAN[key].includes('mixed') ? '`true`, `false` or `mixed`' : '`true` or `false`';
      report(
        'aria-boolean',
        `\`${name}="${value}"\`: the browser reads this as if the attribute were not there. It takes ${takes}`,
        at,
      );
    } else if (key === 'live' && !LIVE.has(lower)) {
      report(
        'aria-live',
        `\`aria-live="${value}"\`: a live region is \`polite\`, \`assertive\` or \`off\`, so updates here are never announced`,
        at,
      );
    } else if (token && (LISTS.has(key) ? lower.split(/\s+/) : [lower]).some((t) => !token[0].split(' ').includes(t))) {
      const values = token[0].split(' ').map((t) => `\`${t}\``);
      report(
        'aria-value',
        `\`${name}="${value}"\` is not one of its values, so the browser reads it as \`${token[1]}\`. It takes ${values.slice(0, -1).join(', ')} or ${values.at(-1)}`,
        at,
      );
    } else if (INTEGER.has(key) && !WHOLE.test(v)) {
      report(
        'aria-value',
        `\`${name}="${value}"\` is not a whole number, so what a screen reader announces depends on the browser`,
        at,
      );
    } else if (NUMBER.has(key) && !DECIMAL.test(v)) {
      report('aria-value', `\`${name}="${value}"\` is not a number: the browser ignores it`, at);
    }
  }
};

// An element waiting to find out whether anything names it.
interface Frame {
  rule: Waiting;
  /** Where it started, which is how `close` finds it again. */
  at: number;
  /** How many elements it sits inside. */
  depth: number;
  /** Has something named it yet? */
  ok: boolean;
  /** The element as a message shows it: `<button>`, `<span role="button">`. */
  shown: string;
  /** What can name it: text or a name inside it, a direct SVG `<title>` child, or a form control. */
  by: 'content' | 'title' | 'control';
}

const rules = (report: A11yReport): Visitor => {
  // The depth of the nearest element that takes its subtree off the page entirely: `hidden`,
  // `inert`, `display: none`, `visibility: hidden`, a <template>. Nothing inside is read or reached.
  // It tracks depth, not offset, so a void element such as `<img hidden>` releases at its next
  // sibling instead of staying set until the parent closes.
  let unseen = Infinity;
  // The same for `aria-hidden="true"`, which hides a subtree from a screen reader but not from the
  // keyboard. Only the keyboard rule looks inside it.
  let muted = Infinity;
  // The same for a closed <details> or <dialog>: shown later, but nothing inside takes focus yet.
  let shelved = Infinity;
  const watch: Frame[] = [];
  const idTag = new Map<string, string>(); // every id, and the tag carrying it
  const fors: [id: string, at: number][] = []; // every `<label for>`, resolved at the end
  const labelled = new Set<string>(); // every id a `<label for>` names
  const fields: [id: string | undefined, at: number, shown: string][] = []; // form fields with no name yet
  let titles = 0; // <title> elements, outside <svg> and <template>: the first is the page's
  let page = -1; // where <html> started, when the markup is a whole page

  return {
    open(tag, a, at, anc) {
      const depth = anc.length;
      if (depth <= unseen) unseen = Infinity; // past the end of the hidden subtree
      if (depth <= muted) muted = Infinity;
      if (depth <= shelved) shelved = Infinity;
      const custom = tag.includes('-');

      // These hold wherever the element sits: a `<label for>` names its control even when hidden,
      // and the page's title is its first <title>, hidden or not.
      const target = tag === 'label' ? a.get('for') : undefined;
      if (target) labelled.add(target);
      if (!anc.includes('template') && !anc.includes('svg')) {
        if (tag === 'html') page = at;
        if (tag === 'title') titles++;
      }

      const unrendered = a.has('hidden') || a.has('inert') || HIDDEN.test(a.get('style') ?? '') || tag === 'template';
      if (unseen === Infinity && unrendered) unseen = depth;
      if (unseen < Infinity) return; // nothing here reaches anyone, so nothing here is a bug

      // aria-hidden takes a subtree from a screen reader, not from the keyboard. Anything in it the
      // keyboard still reaches, the element itself included, is a focus stop that says nothing.
      const ariaHidden = TRUE.test(a.get('aria-hidden') ?? '');
      const reachable =
        shelved === Infinity || (tag === 'summary' && depth === shelved + 1 && anc[shelved] === 'details');
      if ((ariaHidden || muted < Infinity) && reachable && focusable(tag, a)) {
        report(
          'aria-hidden-focus',
          ariaHidden && muted === Infinity
            ? `\`<${tag} aria-hidden="true">\` can still be tabbed to: focus stops here and a screen reader announces nothing`
            : `\`<${tag}>\` is inside \`aria-hidden="true"\` but can still be tabbed to: focus stops there and a screen reader announces nothing`,
          at,
        );
      }
      if (muted === Infinity && ariaHidden) muted = depth;
      if (shelved === Infinity && (tag === 'details' || tag === 'dialog') && !a.has('open')) shelved = depth;
      if (muted < Infinity) return;

      const id = a.get('id');
      // A labelable element wins a duplicate id, because that is the one `for` would resolve to.
      if (id && (!idTag.has(id) || LABELABLE.has(tag) || custom)) idTag.set(id, tag);

      const role = roleOf(tag, a);
      const explicit = explicitRole(a);
      const kind = role && (KIND[role] ?? role); // what the role is a kind of, for the rules that ask
      const shown = explicit && explicit === role ? `<${tag} role="${a.get('role')!.trim()}">` : `<${tag}>`;
      const svg = tag === 'svg' || anc.includes('svg');

      // Anything inside a watched element can be what names it. A custom element counts for both:
      // it may carry its own label or be a form control via ElementInternals, and its inside is
      // hidden from this check either way.
      if (watch.length) {
        const named = custom || (role !== 'none' && names(tag, a));
        const control = custom || LABELABLE.has(tag);
        for (const f of watch) if (f.by === 'control' ? control : f.by === 'content' && named) f.ok = true;
      }
      // Waits on an element until it closes. A void element has nothing inside to wait for, so it
      // is judged now, on its own attributes.
      const wait = (
        rule: Waiting,
        ok: boolean,
        by: Frame['by'] = 'content',
        message = `\`${shown}\` has no name: ${why[rule as Exclude<Waiting, 'label-control'>]}`,
      ) => {
        if (!VOID.has(tag)) watch.push({ rule, at, depth, ok, shown, by });
        else if (!ok) report(rule, message, at);
      };

      // Images: an <img> the browser exposes, an image button, or anything else with an image role.
      if (tag === 'img') {
        const alt = a.get('alt');
        if (role === 'img' && !names(tag, a)) {
          report(
            'img-alt',
            alt === undefined
              ? '`<img>` has no `alt`: a screen reader reads out the file name instead. Write `alt=""` if the image is decoration'
              : `\`alt="${alt}"\` is only whitespace: a screen reader reads out the file name, or nothing. Write \`alt=""\` if the image is decoration`,
            at,
          );
        }
        if (alt && FILENAME.test(alt)) {
          report(
            'img-alt-filename',
            `\`alt="${alt}"\` is a file name: it says nothing about what is in the picture`,
            at,
          );
        }
        if (alt === '' && !explicit && conflicted(tag, a)) {
          report(
            'role-presentation-conflict',
            focusable(tag, a)
              ? '`<img alt="">` can still be tabbed to: the browser drops `alt=""` from anything focusable, so the image is not decoration after all'
              : `\`<img alt="">\` has \`${global(a)}\`: the browser drops \`alt=""\` from an image with a global ARIA attribute, so it is not decoration after all`,
            at,
          );
        }
      } else if (tag === 'input' && inputType(a) === 'image') {
        if (!TEXT.test(a.get('alt') ?? '') && !names(tag, a)) {
          report('img-alt', '`<input type="image">` has no `alt`: a screen reader says only "button"', at);
        }
      } else if (!custom && explicit === role && kind && (svg ? GRAPHIC.has(kind) : kind === 'img')) {
        // An SVG element is named by a `<title>` child as well; anything else only by attributes.
        if (svg) wait('img-alt', names(tag, a), 'title');
        else if (!names(tag, a)) report('img-alt', `\`${shown}\` has no name: ${why['img-alt']}`, at);
      }

      // Controls and headings that take their name from what is inside them.
      if (!custom && kind === 'link') {
        if (tag === 'area') {
          if (!TEXT.test(a.get('alt') ?? '') && !names(tag, a)) {
            report('empty-link', '`<area>` has no `alt`: a screen reader reads out the URL instead', at);
          }
        } else wait('empty-link', names(tag, a) || a.has('contenteditable'));
      } else if (!custom && role === 'button' && !(tag === 'input' && inputType(a) === 'image')) {
        if (tag === 'input') {
          const type = inputType(a);
          if (type !== 'submit' && type !== 'reset' && !TEXT.test(a.get('value') ?? '') && !names(tag, a)) {
            report('empty-button', `\`${shown}\` has no \`value\`: ${why['empty-button']}`, at);
          }
        } else wait('empty-button', names(tag, a) || a.has('contenteditable'));
      } else if (!custom && role === 'heading') {
        wait('empty-heading', names(tag, a) || a.has('contenteditable'));
      } else if (tag === 'title' && titles === 1 && !anc.includes('svg')) {
        wait('empty-title', false);
      } else if (tag === 'label') {
        if (target) fors.push([target, at]);
        watch.push({ rule: 'label-control', at, depth, ok: !!target || a.has('id'), shown, by: 'control' });
      }

      // A form field needs a name: from a <label>, `aria-label`, `aria-labelledby` or `title`, or on
      // a text field `placeholder` as a last resort. A custom element around it may be the label.
      // A field whose `role="none"` the browser honours (a disabled one with no global ARIA
      // attribute) is no field at all.
      if (!custom && role !== 'none' && !anc.some((x) => x.includes('-'))) {
        if ((tag === 'input' && !NOT_A_FIELD.has(inputType(a))) || tag === 'select' || tag === 'textarea') {
          // Every type the browser does not know is text, and takes a placeholder like text does.
          const type = inputType(a);
          const texty = PLACEHOLDER.has(type) || (!INPUT[type] && !NO_ROLE.has(type));
          const placeholder =
            (tag === 'textarea' || (tag === 'input' && texty)) && TEXT.test(a.get('placeholder') ?? '');
          if (!names(tag, a) && !placeholder && !anc.includes('label')) fields.push([a.get('id'), at, shown]);
        } else if (role && explicit === role && FIELD_ROLES.has(role) && !names(tag, a)) {
          if (NAMED_BY_CONTENT.has(role)) wait('field-label', false);
          else report('field-label', `\`${shown}\` has no name: ${why['field-label']}`, at);
        }
      }

      if (tag === 'a') {
        // An `<a>` with no href is a named anchor, or something that was meant to be a link.
        // An id, a name, a tabindex, a role or `aria-disabled` says the author meant it; nothing
        // else does.
        if (
          !a.has('href') &&
          !a.has('xlink:href') &&
          !a.has('id') &&
          !a.has('name') &&
          !a.has('tabindex') &&
          !a.has('role') &&
          !a.has('aria-disabled')
        ) {
          report(
            'a-href',
            '`<a>` with no `href` is not a link: the keyboard cannot reach it and a screen reader skips it',
            at,
          );
        }
      } else if (tag === 'html') {
        if (!TEXT.test(a.get('lang') ?? '')) {
          report(
            'html-lang',
            '`<html>` has no language: a screen reader reads the page in its own language, so the words come out wrong',
            at,
          );
        }
      } else if (tag === 'iframe') {
        // Nobody lands in a frame outside the tab order, and the ACT rule skips it too.
        const t = a.get('tabindex');
        const tabbable = t === undefined || !TABINDEX.test(t) || INTAB.test(t);
        if (tabbable && !names(tag, a)) {
          report(
            'iframe-title',
            '`<iframe>` has no name: a screen reader announces a frame and then reads out its URL',
            at,
          );
        }
      } else if (tag === 'figcaption') {
        const parent = anc[anc.length - 1];
        // No parent means the caption is the whole fragment, which may be deliberate.
        if (parent && parent !== 'figure' && !parent.includes('-')) {
          report(
            'figcaption-parent',
            `\`<figcaption>\` is inside \`<${parent}>\`, not \`<figure>\`: only a direct child captions a figure, so this reads as ordinary text`,
            at,
          );
        }
      }

      if (a.has('scope') && tag !== 'th' && !custom) {
        report(
          'misplaced-scope',
          `\`scope\` on \`<${tag}>\`: only \`<th>\` takes it, so the browser drops it. A header cell is \`<th scope="row">\``,
          at,
        );
      }
      const tab = a.get('tabindex');
      if (tab && AHEAD.test(tab)) {
        report(
          'positive-tabindex',
          `\`tabindex="${tab}"\`: anything above zero is tabbed to before the rest of the page, so the focus order stops following the page. Write \`tabindex="0"\``,
          at,
        );
      }
      checkRole(report, tag, a, at);
      checkValues(report, a, at);
    },

    text(content, _at, anc) {
      if (!watch.length || !TEXT.test(content)) return;
      const depth = anc.length;
      if (depth > unseen || depth > muted) return; // inside something no one reads
      const parent = anc[depth - 1];
      if (parent && SILENT.has(parent)) return;
      for (const f of watch) {
        if (f.by === 'content' || (f.by === 'title' && depth === f.depth + 2 && parent === 'title')) f.ok = true;
      }
    },

    close(_tag, at) {
      const f = watch[watch.length - 1];
      if (!f || f.at !== at) return; // not a watched element; an unclosed one is code 9
      watch.pop();
      if (f.ok) return;
      if (f.rule === 'label-control') {
        report(
          'label-control',
          '`<label>` is not attached to a control: it labels nothing, and clicking it does nothing',
          at,
        );
      } else {
        const lacks = f.rule === 'img-alt' || f.rule === 'field-label' ? 'has no name' : 'has no text';
        report(f.rule, `\`${f.shown}\` ${lacks}: ${why[f.rule]}`, at);
      }
    },

    end() {
      for (const [id, at] of fors) {
        const tag = idTag.get(id);
        // An id that is nowhere on the page is markup code 15, not this rule's finding.
        if (tag && !LABELABLE.has(tag) && !tag.includes('-')) {
          report(
            'label-for',
            `\`for="${id}"\` points at \`<${tag}>\`, which is not a form control: the label names nothing and clicking it does nothing`,
            at,
          );
        }
      }
      for (const [id, at, shown] of fields) {
        if (id && labelled.has(id)) continue;
        report(
          'field-label',
          `\`${shown}\` has no label: ${why['field-label']}. Give it a \`<label>\`, or an \`aria-label\``,
          at,
        );
      }
      if (page >= 0 && !titles) {
        report('empty-title', `the page has no \`<title>\`: ${why['empty-title']}`, page);
      }
    },
  };
};

/** The accessibility rules, with the ones named in `off` silenced. `check()` runs them by default. */
export const a11yRules = (off?: readonly A11yRule[]): RuleSet =>
  off?.length
    ? (report) =>
        rules((rule, message, at) => {
          if (!off.includes(rule)) report(rule, message, at);
        })
    : rules;

/** Every name the accessibility rules report. The set is closed, so a misspelt name is a type error. */
export type A11yRule =
  | 'a-href'
  | 'aria-boolean'
  | 'aria-empty'
  | 'aria-hidden-focus'
  | 'aria-live'
  | 'aria-unknown'
  | 'aria-value'
  | 'empty-button'
  | 'empty-heading'
  | 'empty-link'
  | 'empty-title'
  | 'field-label'
  | 'figcaption-parent'
  | 'html-lang'
  | 'iframe-title'
  | 'img-alt'
  | 'img-alt-filename'
  | 'label-control'
  | 'label-for'
  | 'misplaced-scope'
  | 'positive-tabindex'
  | 'role-presentation-conflict'
  | 'role-redundant'
  | 'role-required-props'
  | 'role-unknown';
