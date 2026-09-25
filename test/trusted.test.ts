import { suite, test } from 'node:test';
import assert from 'node:assert/strict';
import { HtmlError, html, raw, trusted } from '#index';
import { passthrough } from '#trusted';

const s = (x: unknown) => String(x);
const code = (n: number) => (e: unknown) => e instanceof HtmlError && e.code === n;

// The suite runs as the dev build, so `trusted` here is `html` plus the code 20 check.
// `passthrough` is what production binds `trusted` to.
suite('trusted, dev build', () => {
  test('clean values render exactly as html renders them', () => {
    const view = (h: typeof html) =>
      s(
        h`<a href="${'/x?a=1'}" class="${'link'} ${false}" data-n="${3}">${'label'}${h`<b>${'b'}</b>`}${['a', 1, 2n, null, true]}${() => 'thunk'}</a>`,
      );
    assert.equal(view(trusted), view(html));
    assert.equal(view(trusted), '<a href="/x?a=1" class="link " data-n="3">label<b>b</b>a12thunk</a>');
  });
  test('each character escaping would change throws 20, in text and in an attribute', () => {
    for (const ch of ['&', '<', '>', '"', "'"]) {
      assert.throws(() => trusted`<p>${ch}</p>`, code(20), ch);
      assert.throws(() => trusted`<p title="${ch}"></p>`, code(20), ch);
      assert.throws(() => trusted`<p>${[`a${ch}`]}</p>`, code(20), `${ch} in a list`);
      assert.throws(() => trusted`<p>${() => ch}</p>`, code(20), `${ch} from a thunk`);
    }
  });
  test('a URL the guard blocks throws 20, as a string and as Html; one it allows passes', () => {
    assert.throws(() => trusted`<a href="${'javascript:x'}"></a>`, code(20));
    assert.throws(() => trusted`<a href="${raw('javascript:x')}"></a>`, code(20));
    assert.equal(s(trusted`<a href="${raw('https://x?a&b')}"></a>`), '<a href="https://x?a&b"></a>');
    assert.equal(s(trusted`<a href="${'mailto:a@b'}"></a>`), '<a href="mailto:a@b"></a>');
  });
  test('Html where only Html may go is fine; a trusted string there is still refused', () => {
    assert.equal(s(trusted`<script>${raw('let a = 1 < 2;')}</script>`), '<script>let a = 1 < 2;</script>');
    assert.throws(() => trusted`<script>${'x'}</script>`, code(6));
  });
  test('every rule html enforces applies', () => {
    assert.throws(() => trusted`<p onclick="${'x'}"></p>`, code(3));
    assert.throws(() => trusted`<p a=${'x'}></p>`, code(5));
    assert.throws(() => trusted`<p ${'x'}></p>`, code(6));
    assert.throws(() => trusted`<p>${{} as never}</p>`, code(7));
    assert.throws(() => trusted`<div>`, code(9));
  });
  test('the dev message names the value and what html writes instead', () => {
    assert.throws(() => trusted`<p>${'a&b'}</p>`, {
      message:
        'expression 0: trusted writes "a&b" as it is, where html writes "a&amp;b"; use html for a template that takes this value',
    });
  });
  test('html is untouched by trusted', () => {
    assert.equal(s(html`<p>${'a&b'}</p>`), '<p>a&amp;b</p>');
    assert.equal(s(html`<a href="${'javascript:x'}"></a>`), '<a href="about:blank#blocked"></a>');
  });
});

suite('trusted, production (passthrough)', () => {
  test('writes every value as it is', () => {
    assert.equal(s(passthrough`<p title="${'"'}">${'<b>&'}</p>`), '<p title="""><b>&</p>');
    assert.equal(s(passthrough`<a href="${'javascript:x'}"></a>`), '<a href="javascript:x"></a>');
    assert.equal(s(passthrough`<script>${'x'}</script>`), '<script>x</script>');
  });
  test('handles every other value as html does', () => {
    assert.equal(
      s(
        passthrough`<p>${1}${2n}${null}${undefined}${true}${false}${['a', ['b']]}${() => 'c'}${raw('<i>')}${passthrough`<b></b>`}</p>`,
      ),
      '<p>12abc<i><b></b></p>',
    );
    assert.equal(s(passthrough`<p>${new Set(['x', 'y'])}</p>`), '<p>xy</p>');
  });
  test('an object throws 7', () => {
    assert.throws(() => passthrough`<p>${{} as never}</p>`, code(7));
  });
  test('scans each template as html does, so the rules that hold whatever the value still hold', () => {
    assert.throws(() => passthrough`<p onclick="${'x'}"></p>`, code(3));
    assert.throws(() => passthrough`<p a=${'x'}></p>`, code(5));
    // Where only Html may go is decided per value, at render, and production does not check it.
    assert.equal(s(passthrough`<p ${'x'}></p>`), '<p x></p>');
  });
  test('collapses whitespace as html does, and keeps it in <pre>', () => {
    const view = (h: typeof html) => s(h`\n  <ul>\n    <li>${'a'}</li>\n  </ul>\n`);
    assert.equal(view(passthrough), view(html));
    assert.equal(view(passthrough), '<ul> <li>a</li> </ul>');
    assert.equal(s(passthrough`<pre>\n  ${'a'}\n</pre>`), '<pre>\n  a\n</pre>');
  });
  test('caches the chunks per template, and renders each call afresh', () => {
    const view = (x: string) => s(passthrough`<p>\n${x}</p>`);
    assert.equal(view('a'), '<p> a</p>');
    assert.equal(view('b'), '<p> b</p>');
  });
  test('nests into html unescaped: its output is Html', () => {
    assert.equal(s(html`<div>${passthrough`<p>${'<b>'}</p>`}</div>`), '<div><p><b></p></div>');
  });
});
