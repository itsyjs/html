import { suite, test } from 'node:test';
import assert from 'node:assert/strict';
import { attrs, html, raw } from '#index';
import { SCHEMES, createHtml } from '#create';

const s = (x: unknown) => String(x);

suite('createHtml', () => {
  test('schemes replaces the allowed set', () => {
    const { html: h } = createHtml({ schemes: ['https', 'sms'] });
    assert.equal(s(h`<a href="${'sms:123'}">x</a>`), '<a href="sms:123">x</a>');
    assert.equal(s(h`<a href="${'http://x'}">x</a>`), '<a href="about:blank#blocked">x</a>');
    assert.equal(s(html`<a href="${'sms:123'}">x</a>`), '<a href="about:blank#blocked">x</a>'); // the root is untouched
  });
  test('spreading SCHEMES keeps the defaults and adds to them', () => {
    const { html: h } = createHtml({ schemes: [...SCHEMES, 'sms'] });
    for (const u of ['sms:1', 'https://x', 'mailto:a@b', 'data:image/png;base64,x']) {
      assert.equal(s(h`<a href="${u}">x</a>`), `<a href="${u}">x</a>`, u);
    }
    assert.equal(s(h`<a href="${'javascript:x'}">x</a>`), '<a href="about:blank#blocked">x</a>');
  });
  test('no options gives the defaults', () => {
    const { html: h } = createHtml();
    assert.equal(s(h`<a href="${'javascript:x'}">${'<'}</a>`), s(html`<a href="${'javascript:x'}">${'<'}</a>`));
  });
  test('attrs from the pair shares its schemes; the root attrs does not', () => {
    const pair = createHtml({ schemes: ['sms'] });
    assert.equal(s(pair.attrs({ href: 'sms:1', src: 'https://x' })), 'href="sms:1" src="about:blank#blocked"');
    assert.equal(s(attrs({ href: 'sms:1', src: 'https://x' })), 'href="about:blank#blocked" src="https://x"');
  });
  test('raw() in a URL attribute is checked against the pair, not the root', () => {
    const { html: h } = createHtml({ schemes: ['javascript'] });
    assert.equal(s(h`<a href="${raw('javascript:x')}">y</a>`), '<a href="javascript:x">y</a>');
    assert.equal(s(html`<a href="${raw('javascript:x')}">y</a>`), '<a href="about:blank#blocked">y</a>');
  });
  test('collapse: false keeps the markup as written', () => {
    const { html: h } = createHtml({ collapse: false });
    assert.equal(s(h`<ul>\n  <li>${1}</li>\n</ul>`), '<ul>\n  <li>1</li>\n</ul>');
    assert.equal(s(html`<ul>\n  <li>${1}</li>\n</ul>`), '<ul> <li>1</li> </ul>');
  });
  test('each pair has its own template cache', () => {
    const a = createHtml({ collapse: false }).html;
    const b = createHtml().html;
    const view = (h: typeof html) => s(h`<p>\n  ${'x'}\n</p>`);
    assert.equal(view(a), '<p>\n  x\n</p>');
    assert.equal(view(b), '<p> x </p>'); // the same literal, scanned again under b's rule
    assert.equal(view(a), '<p>\n  x\n</p>'); // and a's cache was not overwritten
  });
});
