import { suite, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import type * as Lib from '#index';
import type * as Check from '#check';
import type * as Frame from '#frame';
import type * as Util from '#util';
import type * as Create from '#create';

// Runs against dist/, so it needs `pnpm build` first; `pnpm check` builds before testing.
const dist = new URL('../dist/', import.meta.url);
const built = existsSync(new URL('index.js', dist)) && existsSync(new URL('index.dev.js', dist));
const load = (file: string) => import(new URL(file, dist).href) as Promise<typeof Lib>;
const loadCheck = (file: string) => import(new URL(file, dist).href) as Promise<typeof Check>;
const loadFrame = (file: string) => import(new URL(file, dist).href) as Promise<typeof Frame>;
const loadUtil = (file: string) => import(new URL(file, dist).href) as Promise<typeof Util>;
const loadCreate = (file: string) => import(new URL(file, dist).href) as Promise<typeof Create>;

suite('built output', { skip: !built && 'run pnpm build first' }, () => {
  test('prod and dev builds render the same string', async () => {
    const prod = await load('index.js');
    const dev = await load('index.dev.js');
    const view = (m: typeof Lib) =>
      String(m.html`<a href="${'javascript:x'}" ${m.attrs({ aria: { expanded: false } })}>${() => '<'}</a>`);
    assert.equal(view(prod), '<a href="about:blank#blocked" aria-expanded="false">&lt;</a>');
    assert.equal(view(dev), view(prod));
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
      dev.check('<div>').map((p) => p.code),
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
    ]) {
      assert.ok(!src.includes(word), `prod bundle contains "${word}"`);
    }
  });
});
