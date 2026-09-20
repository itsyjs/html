import { suite, test } from 'node:test';
import assert from 'node:assert/strict';
import { attrs, cx } from '#attrs';

const s = (x: unknown) => String(x);

suite('attrs', () => {
  test('booleans, nullish, strings, numbers', () => {
    assert.equal(
      s(attrs({ disabled: true, required: false, id: null, title: undefined, tabindex: 0, 'data-n': 1n })),
      'disabled tabindex="0" data-n="1"',
    );
  });
  test('values are escaped; URL attributes are checked', () => {
    assert.equal(
      s(attrs({ title: '"<', href: 'javascript:x', src: '/ok.png' })),
      'title="&quot;&lt;" href="about:blank#blocked" src="/ok.png"',
    );
    assert.equal(
      s(attrs({ HREF: 'javascript:x', 'xlink:href': 'javascript:x' })),
      'HREF="about:blank#blocked" xlink:href="about:blank#blocked"',
    );
    assert.equal(
      s(attrs({ srcset: '/w_300,h_200/s.jpg 300w, javascript:x 2x' })),
      'srcset="/w_300,h_200/s.jpg 300w, javascript:x 2x"',
    );
  });
  test('class takes every cx shape', () => {
    assert.equal(s(attrs({ class: ['a', false, { b: true, c: 0 }, ['d']] })), 'class="a b d"');
    assert.equal(s(attrs({ class: '' })), 'class=""');
  });
  test('style takes an object, keys as written', () => {
    assert.equal(
      s(attrs({ style: { color: 'red', '--x': 1, 'margin-top': null, top: false } })),
      'style="color:red;--x:1;"',
    );
  });
  test('refused names and wrong shapes throw', () => {
    assert.throws(() => attrs({ onclick: 'x' }), /refusing/);
    assert.throws(() => attrs({ 'data-x': ['a'] }), /string, number or boolean/);
    assert.throws(() => attrs({ style: ['a'] }), /string, number or boolean/);
  });
  test('names are written out as given, unchecked', () => {
    assert.equal(s(attrs({ 'data-x y': 1 })), 'data-x y="1"');
  });
  test('empty object renders nothing', () => {
    assert.equal(s(attrs({})), '');
  });
  test('aria-*, draggable, spellcheck and contenteditable keep their booleans as strings', () => {
    assert.equal(
      s(
        attrs({
          'aria-expanded': false,
          'aria-hidden': true,
          draggable: false,
          spellcheck: true,
          contenteditable: false,
          'aria-label': null,
        }),
      ),
      'aria-expanded="false" aria-hidden="true" draggable="false" spellcheck="true" contenteditable="false"',
    );
    // data-* is an ordinary attribute: present or absent
    assert.equal(s(attrs({ 'data-active': true, 'data-off': false })), 'data-active');
  });
  test('aria and data groups spread with the same value rules', () => {
    assert.equal(
      s(
        attrs({
          aria: { expanded: false, controls: 'menu', label: undefined },
          data: { lenkegruppe: 'x', active: true, off: false, n: 3 },
        }),
      ),
      'aria-expanded="false" aria-controls="menu" data-lenkegruppe="x" data-active data-n="3"',
    );
    assert.equal(s(attrs({ data: { q: '"<' } })), 'data-q="&quot;&lt;"');
    // a string `data` is <object data="…">, a URL
    assert.equal(s(attrs({ data: 'javascript:x' })), 'data="about:blank#blocked"');
    assert.throws(() => attrs({ aria: { x: ['a'] } as never }), /string, number or boolean/);
    assert.throws(() => attrs({ aria: ['x'] as never }), /string, number or boolean/);
  });
  test('errors carry a stable code', () => {
    assert.throws(() => attrs({ 'data-x': ['a'] }), { code: 2 });
    assert.throws(() => attrs({ onclick: 'x' }), { code: 3 });
  });
});

suite('cx', () => {
  test('behaves like clsx', () => {
    assert.equal(cx('a', undefined, null, false, 0, 'b', ['c', ['d']], { e: true, f: false }), 'a b c d e');
    assert.equal(cx(), '');
  });
});
