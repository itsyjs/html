import { suite, test } from 'node:test';
import assert from 'node:assert/strict';
import { html, raw } from '#index';

const s = (x: unknown) => String(x);
const a = (u: string) => s(html`<a href="${u}">x</a>`);

suite('URL scheme guard', () => {
  test('blocks the dangerous schemes however they are spelled', () => {
    for (const u of ['javascript:alert(1)', '  JaVa\tScRiPt:x', 'java\nscript:x', 'vbscript:x', 'sms:1', 'ftp://x']) {
      assert.equal(a(u), '<a href="about:blank#blocked">x</a>', u);
    }
  });
  test('allows relative, http(s), mailto, tel, data and blob', () => {
    for (const u of [
      '/a',
      './a',
      '../a',
      '?q=1',
      '#top',
      'https://nav.no',
      'HTTP://nav.no',
      'mailto:a@b.no',
      'tel:+47',
      'data:image/png;base64,iVBORw0KGgo=',
      'blob:https://x.y/0-1',
    ]) {
      assert.equal(a(u), `<a href="${u.replace(/&/g, '&amp;')}">x</a>`, u);
    }
  });
  test('entity-smuggled schemes are inert because & is escaped first', () => {
    assert.equal(a('&#106;avascript:x'), '<a href="&amp;#106;avascript:x">x</a>');
  });
  test('srcset is not a URL attribute here: escaped only, never scheme-checked', () => {
    // An image source never runs script, and the several-URL syntax is not worth a parser.
    assert.equal(s(html`<img srcset="${'javascript:x 1x, a,b 2x'}">`), '<img srcset="javascript:x 1x, a,b 2x">');
  });
  test('Html outside a URL attribute is never scheme-checked', () => {
    // Text that starts like a scheme is still text, and `label:` is still script.
    assert.equal(s(html`<p>${raw('javascript:x')}</p>`), '<p>javascript:x</p>');
    assert.equal(s(html`<script>${raw('a: for (;;) break a;')}</script>`), '<script>a: for (;;) break a;</script>');
  });
});
