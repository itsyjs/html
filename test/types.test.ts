// Compile-time assertions. `tsc --noEmit` (part of `pnpm check`) fails if a `@ts-expect-error` line stops
// erroring. That keeps the README's "a type error before that" true. Nothing here runs: the function is
// never called, and the one test only gives `node --test` something to report.
import { test } from 'node:test';
import { type Html, type Renderable, attrs, html, raw } from '#index';
import { type FramePart, element, frame } from '#frame';
import { choose, comment, join, map, range, wrap } from '#util';
import { createHtml } from '#create';
import { type Problem, type RuleSet, check } from '#check';

const never = () => {
  const user = { name: 'x' };
  // @ts-expect-error an object is not Renderable
  void html`<p>${user}</p>`;
  // @ts-expect-error a promise is not Renderable
  void html`<p>${Promise.resolve('x')}</p>`;
  // @ts-expect-error nor is a list of objects
  void html`<ul>${[user]}</ul>`;
  // @ts-expect-error a thunk must return a Renderable
  void html`<p>${() => user}</p>`;
  // @ts-expect-error attrs() takes an object
  void attrs('disabled');
  // @ts-expect-error an attribute value cannot be a function
  void attrs({ title: () => 'x' });
  // @ts-expect-error a plain string is not Html: it has not been through the renderer
  const h: Html = '<b>';
  // @ts-expect-error a head part is an entry or Html, not a string
  void frame({ lang: 'nb', title: 't', head: '<link>' });
  // @ts-expect-error a tag is required
  void element({ attrs: { rel: 'icon' } });
  // @ts-expect-error wrap() attributes are an object
  void wrap(['a'], 'li', 'class');
  // @ts-expect-error a choose() case must return a Renderable
  void choose('a', [['a', () => ({})]]);
  // @ts-expect-error schemes is a list of strings
  void createHtml({ schemes: 5 });

  // @ts-expect-error a misspelt rule cannot be turned off, because it cannot be named
  void check('<p></p>', { a11y: { without: ['img-altt'] } });
  // @ts-expect-error nor compared against: no finding from the built-in rules carries that name
  void check('<p></p>').some((p) => 'rule' in p && p.rule === 'img-altt');
  // @ts-expect-error a finding has no code, and the accessibility rules are on by default
  void check('<p></p>').map((p) => p.code);
  // @ts-expect-error enabled is the build's to set
  check.enabled = false;

  const markupOnly: Problem[] = check('<p></p>', { a11y: false });
  const house: RuleSet = (report) => ({ open: (tag, _a, at) => report('house', tag, at) });
  const anyName: boolean = check('<p></p>', { rules: house }).some((p) => 'rule' in p && p.rule === 'house');

  const ok: Renderable = [1, 'a', null, html`<b></b>`, () => [2n, true]];
  const util: Renderable = [join([1, 2], ', '), map(range(3), String), wrap(['a'], 'li'), comment('x')];
  const part: FramePart = raw('<link>');
  const made: Renderable = createHtml().html`<b></b>`;
  return [h, ok, part, util, made, markupOnly, anyName];
};

test('the types hold (checked by tsc)', () => {
  void never;
});
