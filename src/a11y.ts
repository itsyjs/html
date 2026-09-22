// Accessibility rules for `check()`. Advice, never a reason to throw: everything here is markup
// the browser renders exactly as written, and a person using the page pays for.
//
// A rule only fires when it is sure. Reporting correct markup is worse than missing a bug, because
// one wrong finding is all it takes for someone to turn the whole thing off, so every borderline
// case below is deliberately silent.
//
// The rule names and most of the reasoning come from Svelte's a11y pass (MIT), which took them
// from eslint-plugin-jsx-a11y.
//
// The role tables below are written out rather than taken from aria-query and axobject-query,
// which are 10.9 kB brotli between them and would be a dependency in a library that has none.
// They cost nothing to ship — `check()` compiles this whole file away in production — so what
// they are trimmed against is false positives, not bytes: a mapping that depends on an ancestor
// or on another attribute is left out rather than guessed at. The one rule still missing is
// "this `aria-*` is not allowed on this role": it needs the full role-to-properties graph, which
// is both the largest table and the easiest one to be wrong with.
//
// This file is only ever reached from `check()`, inside its `__DEV__` branch.
import type { Report, RuleSet } from './audit.ts';

type Attrs = ReadonlyMap<string, string>;

const set = (names: string) => new Set(names.split(' '));

// Every ARIA attribute name, without its `aria-` prefix. A name outside this list does nothing at
// all — no browser and no screen reader reads it — so a typo is silent. That is what the list buys.
const ARIA = /* @__PURE__ */ set(
  'activedescendant atomic autocomplete braillelabel brailleroledescription busy checked colcount colindex colindextext colspan controls current describedby description details disabled dropeffect errormessage expanded flowto grabbed haspopup hidden invalid keyshortcuts label labelledby level live modal multiline multiselectable orientation owns placeholder posinset pressed readonly relevant required roledescription rowcount rowindex rowindextext rowspan selected setsize sort valuemax valuemin valuenow valuetext',
);
// The ones that take only true or false. `mixed` and `undefined` are legal literals too, and the
// token attributes (`aria-current`, `aria-haspopup`, `aria-invalid`) are deliberately not here:
// their value sets happen to include `true`, so checking them as booleans would be wrong.
const BOOL = /* @__PURE__ */ set(
  'atomic busy checked disabled expanded grabbed hidden modal multiline multiselectable pressed readonly required selected',
);
const BOOL_OK = /* @__PURE__ */ set('true false mixed undefined');
const LIVE = /* @__PURE__ */ set('polite assertive off');
// What a `<label>` can label, and what a `for` may point at.
const LABELABLE = /* @__PURE__ */ set('button input meter output progress select textarea');
// Form controls the keyboard reaches, unless they are disabled.
const CONTROL = /* @__PURE__ */ set('button select textarea input');

const TEXT = /\S/;
const TRUE = /^\s*true\s*$/i;
const NONE = /display\s*:\s*none/i;
const DECOR = /^\s*(presentation|none)\b/i;
const HEADING = /^h[1-6]$/;
// A tab stop the browser puts before everything else: 0 or more zeroes then 1-9. `0`, `-1`, `0x2`
// and `.5` all read as zero or less and are correct.
const AHEAD = /^\s*\+?0*[1-9]/;
// Any tabindex the browser reads as zero or more, which is what puts an element in the tab order.
const INTAB = /^\s*\+?\d/;
// An alt that is the file it came from: "IMG_1024.JPG", "photo-3.png", "dsc00042".
const FILENAME = /^\s*(\S+\.(jpe?g|png|gif|svg|webp|avif|bmp)|(img|dsc|image|photo|screenshot)[-_]?\d+)\s*$/i;

// Every ARIA role that may be written on an element, the ARIA 1.3 draft's included. The abstract
// ones (`widget`, `section`, `input`, …) are left out: they exist only in the taxonomy and do
// nothing in markup. A role from another vocabulary — `doc-*` from DPUB-ARIA, `graphics-*` —
// carries a hyphen and is skipped rather than guessed at.
const ROLES = /* @__PURE__ */ set(
  'alert alertdialog application article banner blockquote button caption cell checkbox code columnheader combobox comment complementary contentinfo definition deletion dialog directory document emphasis feed figure form generic grid gridcell group heading image img insertion link list listbox listitem log main mark marquee math menu menubar menuitem menuitemcheckbox menuitemradio meter navigation none note option paragraph presentation progressbar radio radiogroup region row rowgroup rowheader scrollbar search searchbox sectionfooter sectionheader separator slider spinbutton status strong subscript suggestion superscript switch tab table tablist tabpanel term textbox time timer toolbar tooltip tree treegrid treeitem',
);

// The state a role cannot be read without. Only what ARIA requires outright is here: a rule that
// fires on correct markup is worse than one that misses, and the conditional ones (`separator`
// only when focusable, `option` inside a listbox) are exactly where that goes wrong. `spinbutton`
// is not here either: ARIA asks for its `aria-valuenow` only when it has a value.
const REQUIRED: Record<string, string> = {
  checkbox: 'aria-checked',
  combobox: 'aria-expanded',
  heading: 'aria-level',
  menuitemcheckbox: 'aria-checked',
  menuitemradio: 'aria-checked',
  radio: 'aria-checked',
  scrollbar: 'aria-valuenow',
  slider: 'aria-valuenow',
  switch: 'aria-checked',
};

// The role an element already carries, for the roles that the tag settles on its own. `<aside>`,
// `<header>`, `<footer>`, `<section>`, `<li>`, `<td>` and `<th>` all depend on an ancestor, so
// they are left out: a wrong "redundant" is a rule nobody keeps on. `<ul>`, `<ol>` and `<menu>` are
// left out too, though they are always a list: Safari drops that role from a list styled
// `list-style: none`, and `role="list"` is how you put it back. The tags whose own attributes
// settle it — `<a>`, `<input>`, `<select>` — are handled in `implicitRole` below.
const IMPLICIT: Record<string, string> = {
  article: 'article',
  blockquote: 'blockquote',
  button: 'button',
  caption: 'caption',
  code: 'code',
  datalist: 'listbox',
  del: 'deletion',
  details: 'group',
  dfn: 'term',
  dialog: 'dialog',
  em: 'emphasis',
  fieldset: 'group',
  figure: 'figure',
  form: 'form',
  hr: 'separator',
  html: 'document',
  ins: 'insertion',
  main: 'main',
  math: 'math',
  meter: 'meter',
  nav: 'navigation',
  optgroup: 'group',
  option: 'option',
  output: 'status',
  p: 'paragraph',
  progress: 'progressbar',
  search: 'search',
  strong: 'strong',
  sub: 'subscript',
  sup: 'superscript',
  table: 'table',
  tbody: 'rowgroup',
  textarea: 'textbox',
  tfoot: 'rowgroup',
  thead: 'rowgroup',
  time: 'time',
  tr: 'row',
};

// `<input>` types whose role holds whatever else is on the tag. The text-like types are left out:
// with a `list` attribute they are a combobox instead, and that is not worth a false positive.
const INPUT: Record<string, string> = {
  button: 'button',
  checkbox: 'checkbox',
  image: 'button',
  number: 'spinbutton',
  radio: 'radio',
  range: 'slider',
  reset: 'button',
  submit: 'button',
};

// The state an `<input>` reports for itself, whatever role it is given: a checkbox or radio button
// its checkedness, a range or number its value. `<input type="checkbox" role="switch">` is the
// native switch, and ARIA in HTML forbids the `aria-checked` a rule would otherwise ask it for.
const NATIVE: Record<string, string> = {
  checkbox: 'aria-checked',
  number: 'aria-valuenow',
  radio: 'aria-checked',
  range: 'aria-valuenow',
};

/** An `<input>`'s type, as the browser reads it. */
const inputType = (a: Attrs) => (a.get('type') ?? '').trim().toLowerCase();

/** The role this element already has, when the markup on its own settles it. */
const implicitRole = (tag: string, a: Attrs): string | undefined => {
  if (HEADING.test(tag)) return 'heading';
  if (tag === 'a' || tag === 'area') return a.has('href') ? 'link' : undefined;
  if (tag === 'input') return INPUT[inputType(a)];
  // A `<select>` is a listbox when it shows more than one row, and a combobox otherwise. Both are
  // settled here, and both matter: without this, `<select role="combobox">` is reported as
  // missing the `aria-expanded` that the element reports for itself.
  if (tag === 'select') return a.has('multiple') || Number(a.get('size')) > 1 ? 'listbox' : 'combobox';
  return IMPLICIT[tag];
};

const why: Record<string, string> = {
  'empty-heading': 'a screen reader announces a heading and then reads nothing',
  'empty-link': 'a screen reader reads out the URL instead',
  'empty-button': 'a screen reader says only "button"',
  'empty-title': 'the tab, the bookmark and the first thing a screen reader reads are all blank',
};

/** Is it named by ARIA? This is the exception for a rule asking about `title` itself. */
const labelled = (a: Attrs) => a.has('aria-label') || a.has('aria-labelledby');
/** Does this element carry a name of its own, `title` included? */
const hasName = (a: Attrs) => labelled(a) || a.has('title');
/** Does it carry one with something actually in it? */
const names = (tag: string, a: Attrs) =>
  TEXT.test(a.get('aria-label') ?? '') ||
  TEXT.test(a.get('aria-labelledby') ?? '') ||
  TEXT.test(a.get('title') ?? '') ||
  (tag === 'img' && TEXT.test(a.get('alt') ?? ''));

/** Can the keyboard tab to this element, going only by its own markup? */
const focusable = (tag: string, a: Attrs) => {
  const t = a.get('tabindex');
  if (t !== undefined) return INTAB.test(t);
  if (tag === 'a' || tag === 'area') return a.has('href');
  if (tag === 'audio' || tag === 'video') return a.has('controls');
  if (tag === 'summary') return true;
  return CONTROL.has(tag) && !a.has('disabled') && a.get('type') !== 'hidden';
};

/** Reports what is wrong with an element's `role`, if anything. */
const checkRole = (report: Report, tag: string, a: Attrs, at: number) => {
  const role = a.get('role') ?? '';
  const tokens = role.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return; // an empty `role` is `aria-empty`'s
  // `role` takes a list, and the browser uses the first entry it knows. A role from another
  // vocabulary may be that entry, and these tables cannot say, so the check stops at one.
  const known = tokens.find((t) => ROLES.has(t) || t.includes('-'));
  if (known?.includes('-')) return;
  if (!known) {
    report(
      'role-unknown',
      `\`role="${role}"\` is not an ARIA role: the browser ignores it, so \`<${tag}>\` keeps the role it already had`,
      at,
    );
  } else if (known === implicitRole(tag, a)) {
    report(
      'role-redundant',
      `\`<${tag} role="${known}">\`: \`<${tag}>\` is already a \`${known}\`, so the attribute says nothing the browser did not know`,
      at,
    );
  } else if ((known === 'presentation' || known === 'none') && focusable(tag, a)) {
    report(
      'role-presentation-interactive',
      `\`<${tag} role="${known}">\` can still be tabbed to: the browser drops a presentational role from anything focusable, so this does nothing`,
      at,
    );
  } else {
    // The state the role is read with, unless the element supplies it: one that already had the
    // role reports its own (the branch above), and so does an `<input>` with the state built in.
    const need = REQUIRED[known];
    if (need && !a.has(need) && !(tag === 'input' && NATIVE[inputType(a)] === need)) {
      report(
        'role-required-props',
        `\`role="${known}"\` has no \`${need}\`: a screen reader announces the role and then has no state to read`,
        at,
      );
    }
  }
};

// An element waiting to find out whether anything names it: the rule to report, where it started,
// whether it has been satisfied, and its tag.
type Frame = [rule: string, at: number, ok: boolean, tag: string];

const rules: RuleSet = (report) => {
  // The depth of the nearest element that takes its subtree out of the page a person hears.
  // Depth rather than offset, so a void element such as `<img hidden>` releases on its next
  // sibling instead of latching until the parent closes.
  let shut = Infinity;
  const watch: Frame[] = [];
  const idTag = new Map<string, string>(); // every id, and the tag carrying it
  const fors: [id: string, at: number][] = []; // every `<label for>`, resolved at the end

  return {
    open(tag, a, at, anc) {
      const depth = anc.length;
      if (depth <= shut) shut = Infinity; // out the other side of whatever was hidden
      const inside = shut < Infinity;
      const unrendered = a.has('hidden') || a.has('inert') || NONE.test(a.get('style') ?? '');
      const ariaHidden = TRUE.test(a.get('aria-hidden') ?? '');

      // This one reports on the element that is hiding itself, so it has to run before the gate.
      if (!inside && !unrendered && ariaHidden && focusable(tag, a)) {
        report(
          'aria-hidden-focus',
          `\`<${tag} aria-hidden="true">\` can still be tabbed to: focus stops here and a screen reader announces nothing`,
          at,
        );
      }
      if (!inside && (unrendered || ariaHidden || tag === 'template')) shut = depth;
      if (shut < Infinity) return; // nothing in here reaches anyone, so nothing in here is a bug

      const id = a.get('id');
      // A labelable element wins a duplicate id, because that is the one `for` would resolve to.
      if (id && (!idTag.has(id) || LABELABLE.has(tag) || tag.includes('-'))) idTag.set(id, tag);

      // Anything inside an element we are watching can be the thing that names it. A custom
      // element counts for both: it may carry its own label, or be a form control via
      // ElementInternals, and we cannot see inside it either way.
      if (watch.length) {
        const custom = tag.includes('-');
        const named = custom || names(tag, a);
        const control = custom || LABELABLE.has(tag);
        for (const f of watch) if (f[0] === 'label-control' ? control : named) f[2] = true;
      }

      if (tag === 'img') {
        if (!a.has('alt') && !hasName(a) && !DECOR.test(a.get('role') ?? '')) {
          report(
            'img-alt',
            '`<img>` has no `alt`: a screen reader reads out the file name instead. Write `alt=""` if the image is decoration',
            at,
          );
        }
        const alt = a.get('alt');
        if (alt && FILENAME.test(alt)) {
          report(
            'img-alt-filename',
            `\`alt="${alt}"\` is a file name: it says nothing about what is in the picture`,
            at,
          );
        }
      } else if (tag === 'a') {
        // An `<a>` with no href is a named anchor, or something that was meant to be a link.
        // An id, a name, a tabindex or a role all say the author meant it; nothing else does.
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
        if (a.has('href')) watch.push(['empty-link', at, names(tag, a) || a.has('contenteditable'), tag]);
      } else if (tag === 'html') {
        if (!a.get('lang')) {
          report(
            'html-lang',
            '`<html>` has no language: a screen reader reads the page in its own language, so the words come out wrong',
            at,
          );
        }
      } else if (tag === 'iframe') {
        if (!a.get('title') && !labelled(a) && !DECOR.test(a.get('role') ?? '')) {
          report(
            'iframe-title',
            '`<iframe>` has no name: a screen reader announces a frame and then reads out its URL',
            at,
          );
        }
      } else if (tag === 'figcaption') {
        const parent = anc[anc.length - 1];
        // No parent at all means the caption is the whole fragment, which may well be deliberate.
        if (parent && parent !== 'figure' && !parent.includes('-')) {
          report(
            'figcaption-parent',
            `\`<figcaption>\` is inside \`<${parent}>\`, not \`<figure>\`: only a direct child captions a figure, so this reads as ordinary text`,
            at,
          );
        }
      } else if (tag === 'button' || HEADING.test(tag)) {
        watch.push([
          tag === 'button' ? 'empty-button' : 'empty-heading',
          at,
          names(tag, a) || a.has('contenteditable'),
          tag,
        ]);
      } else if (tag === 'title') {
        // An `<svg><title>` is a graphic's name, a different element with different rules.
        if (!anc.includes('svg')) watch.push(['empty-title', at, false, tag]);
      } else if (tag === 'label') {
        const target = a.get('for');
        if (target) fors.push([target, at]);
        watch.push(['label-control', at, !!target || a.has('id'), tag]);
      }

      if (a.has('scope') && tag !== 'th' && !tag.includes('-')) {
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

      for (const [name, value] of a) {
        const v = value.trim();
        if (name.startsWith('aria-')) {
          const key = name.slice(5);
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
          } else if (BOOL.has(key) && !BOOL_OK.has(v.toLowerCase())) {
            report(
              'aria-boolean',
              `\`${name}="${value}"\`: the browser reads this as if the attribute were not there. Write \`true\` or \`false\`, or \`mixed\` on a half-checked control`,
              at,
            );
          } else if (key === 'live' && !LIVE.has(v.toLowerCase())) {
            report(
              'aria-live',
              `\`aria-live="${value}"\`: a live region is \`polite\`, \`assertive\` or \`off\`, so updates here are never announced`,
              at,
            );
          }
        } else if (name === 'role' && !v) {
          report(
            'aria-empty',
            '`role=""` does nothing: an empty value reads the same as leaving the attribute out',
            at,
          );
        }
      }
    },

    close(tag, at, hadText) {
      const f = watch[watch.length - 1];
      if (!f || f[1] !== at) return; // not something we are watching; an unclosed one is code 9
      watch.pop();
      if (f[2]) return;
      if (f[0] === 'label-control') {
        report(
          'label-control',
          '`<label>` is not attached to a control: it labels nothing, and clicking it does nothing',
          at,
        );
      } else if (!hadText) {
        report(f[0], `\`<${f[3]}>\` has no text: ${why[f[0]]}`, at);
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
    },
  };
};

/** The accessibility rules, with the ones named in `off` silenced. `check()` runs them by default. */
export const a11yRules = (off: readonly A11yRule[] = []): RuleSet =>
  off.length
    ? (report) =>
        rules((rule, message, at) => {
          if (!off.includes(rule as A11yRule)) report(rule, message, at);
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
  | 'empty-button'
  | 'empty-heading'
  | 'empty-link'
  | 'empty-title'
  | 'figcaption-parent'
  | 'html-lang'
  | 'iframe-title'
  | 'img-alt'
  | 'img-alt-filename'
  | 'label-control'
  | 'label-for'
  | 'misplaced-scope'
  | 'positive-tabindex'
  | 'role-presentation-interactive'
  | 'role-redundant'
  | 'role-required-props'
  | 'role-unknown';
