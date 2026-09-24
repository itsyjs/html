import { suite, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { inspect } from 'node:util';
import type * as Lib from '#index';
import type * as Check from '#check';
import type * as Frame from '#frame';
import type * as Util from '#util';
import type * as Create from '#create';

// Runs against dist/, so it only runs after a build. `pnpm build` runs it through `postbuild`,
// and `pnpm check` reaches it through `check:build`. It sits in its own directory because
// `pnpm test` globs `test/*.test.ts`, which does not recurse. So the normal suite stays a fast
// inner loop that needs no build, and this file cannot rejoin it by accident.
const dist = new URL('../../dist/', import.meta.url);
const built = existsSync(new URL('index.js', dist)) && existsSync(new URL('index.dev.js', dist));

// Deliberately not a `skip`. A missing dist/ means the invocation was wrong. A skip would report
// success having tested nothing. This file used to do exactly that, which is why it moved out of
// the normal suite.
if (!built) throw new Error('dist/ is missing — run `pnpm build`, which runs these via postbuild');

const load = (file: string) => import(new URL(file, dist).href) as Promise<typeof Lib>;
const loadCheck = (file: string) => import(new URL(file, dist).href) as Promise<typeof Check>;
const loadFrame = (file: string) => import(new URL(file, dist).href) as Promise<typeof Frame>;
const loadUtil = (file: string) => import(new URL(file, dist).href) as Promise<typeof Util>;
const loadCreate = (file: string) => import(new URL(file, dist).href) as Promise<typeof Create>;

suite('built output', () => {
  test('prod and dev builds render the same string', async () => {
    const prod = await load('index.js');
    const dev = await load('index.dev.js');
    const view = (m: typeof Lib) =>
      String(m.html`<a href="${'javascript:x'}" ${m.attrs({ aria: { expanded: false } })}>${() => '<'}</a>`);
    assert.equal(view(prod), '<a href="about:blank#blocked" aria-expanded="false">&lt;</a>');
    assert.equal(view(dev), view(prod));
  });
  test("two copies of the library recognise each other's Html", async () => {
    // The only place two copies exist naturally: the prod and dev builds. Without the shared
    // brand, a nested template from the other copy would be escaped as text, silently.
    const prod = await load('index.js');
    const dev = await load('index.dev.js');
    const inner = dev.html`<i>${'a&b'}</i>`;
    assert.ok(prod.isHtml(inner) && dev.isHtml(prod.raw('<b>')));
    assert.equal(String(prod.html`<p>${inner}</p>`), '<p><i>a&amp;b</i></p>');
    assert.equal(String(dev.html`<p>${prod.raw('<b>')}</p>`), '<p><b></p>');
    // …and a URL from the other copy is still scheme-checked by this one.
    assert.equal(String(prod.html`<a href="${dev.raw('javascript:x')}"></a>`), '<a href="about:blank#blocked"></a>');
  });
  test('Html keeps its name through the minifier', async () => {
    // Minified, the class is `var n=class{…}`. console.log and Node's "Received an instance of"
    // errors read the name, so without `static name` they would say `n`.
    const prod = await load('index.js');
    const dev = await load('index.dev.js');
    assert.equal(prod.html`<b></b>`.constructor.name, 'Html');
    assert.equal(dev.html`<b></b>`.constructor.name, 'Html');
    assert.equal(inspect(prod.html`<b></b>`), 'Html {}');
  });
  test('prod says E<code>, dev spells it out; both carry the code', async () => {
    const prod = await load('index.js');
    const dev = await load('index.dev.js');
    assert.throws(() => prod.html`<i ${'x'}></i>`, { name: 'HtmlError', code: 6, message: 'E6' });
    assert.throws(() => dev.html`<i ${'x'}></i>`, {
      name: 'HtmlError',
      code: 6,
      message: /expression 0 is inside a tag/,
    });
    assert.throws(() => prod.attrs({ onclick: 'x' }), { code: 3, message: 'E3' });
    assert.throws(() => dev.attrs({ onclick: 'x' }), { code: 3, message: /refusing/ });
  });
  test('check() is a stub in prod and the validator in dev', async () => {
    const prod = await loadCheck('check.js');
    const dev = await loadCheck('check.dev.js');
    assert.deepEqual(prod.check('<div>'), []);
    assert.deepEqual(
      dev.check('<div>', { a11y: false }).map((p) => p.code),
      [9],
    );
  });
  test('frame renders the same document in both builds', async () => {
    const prod = await loadFrame('frame.js');
    const dev = await loadFrame('frame.dev.js');
    const doc = (m: typeof Frame) => String(m.frame({ lang: 'nb', title: 't<', content: 'x' }));
    assert.match(
      doc(prod),
      /^<!doctype html><html lang="nb"><head><meta charset="utf-8">.*<title>t&lt;<\/title><\/head><body><main id="maincontent" tabindex="-1">x<\/main><\/body><\/html>$/,
    );
    assert.equal(doc(dev), doc(prod));
    assert.throws(() => prod.element({ tag: 'x y' }), { code: 17, message: 'E17' });
  });
  test('util renders the same in both builds', async () => {
    const prod = await loadUtil('util.js');
    const dev = await loadUtil('util.dev.js');
    // The template tag comes from the same build, so both sides share one `Html` class.
    const view = (u: typeof Util, m: typeof Lib) =>
      String(m.html`${u.wrap(['a<'], 'li', { href: 'javascript:x' })}${u.comment('a--')}`);
    const out = view(prod, await load('index.js'));
    assert.equal(out, '<li href="about:blank#blocked">a&lt;</li><!-- a- - -->');
    assert.equal(view(dev, await load('index.dev.js')), out);
    assert.throws(() => prod.wrap([], 'x y'), { code: 17, message: 'E17' });
    assert.throws(() => dev.wrap([], 'x y'), { code: 17, message: /bad tag name/ });
  });
  test('create renders the same in both builds', async () => {
    const prod = await loadCreate('create.js');
    const dev = await loadCreate('create.dev.js');
    const view = (m: typeof Create) => String(m.createHtml({ schemes: ['sms'] }).html`<a href="${'sms:1'}">${'<'}</a>`);
    assert.equal(view(prod), '<a href="sms:1">&lt;</a>');
    assert.equal(view(dev), view(prod));
  });
  test('the prose and the flag are not in the prod bundle', () => {
    const files = readdirSync(dist).filter((f) => f.endsWith('.js') && !f.endsWith('.dev.js'));
    const src = files.map((f) => readFileSync(new URL(f, dist), 'utf8')).join('\n');
    for (const word of [
      '__DEV__',
      'quote the attribute',
      'refusing to interpolate',
      'cannot render',
      'bad attribute name',
      'a comment',
      'optgroup',
      'never closed',
      'closes nothing',
      'bad tag name',
      'the URL guard blocked',
      // The accessibility rules moved inside check(). These are the strings that would show up
      // if the rules came with it. This assertion keeps the merge honest.
      'aria-labelledby',
      'screen reader',
      'menuitemcheckbox',
      'is not an ARIA role',
    ]) {
      assert.ok(!src.includes(word), `prod bundle contains "${word}"`);
    }
  });
  test('check() is inert in prod and says so', async () => {
    const prod = await loadCheck('check.js');
    const dev = await loadCheck('check.dev.js');
    assert.equal(prod.check.enabled, false);
    assert.equal(dev.check.enabled, true);
    // The hazard `enabled` exists for: a suite resolving prod passes every assertion below.
    assert.deepEqual(prod.check('<img src="a"><div>'), []);
    assert.deepEqual(
      dev.check('<img src="a"><div>').map((p) => ('rule' in p ? p.rule : p.code)),
      ['img-alt', 9],
    );
  });
  test('the accessibility rules run by default, and turn off by name', async () => {
    const dev = await loadCheck('check.dev.js');
    assert.deepEqual(
      dev.check('<img src="a">').map((p) => ('rule' in p ? p.rule : p.code)),
      ['img-alt'],
    );
    assert.deepEqual(dev.check('<img src="a">', { a11y: false }), []);
    assert.deepEqual(dev.check('<img src="a">', { a11y: { without: ['img-alt'] } }), []);
  });
  test('a11y is no longer a separate entry point', () => {
    for (const f of ['a11y.js', 'a11y.dev.js']) {
      assert.ok(!existsSync(new URL(f, dist)), `dist/${f} should be gone`);
    }
  });
});
