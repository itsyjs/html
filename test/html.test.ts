import { suite, test } from 'node:test';
import assert from 'node:assert/strict';
import { type Renderable, Html, HtmlError, attrs, html, isHtml, raw } from '#index';

const s = (x: unknown) => String(x);

suite('values', () => {
  test('strings are escaped, Html is not', () => {
    assert.equal(s(html`<p>${'<b>&</b>'}</p>`), '<p>&lt;b&gt;&amp;&lt;/b&gt;</p>');
    assert.equal(s(html`<p>${raw('<b>')}</p>`), '<p><b></p>');
    assert.equal(s(html`<p>${html`<b>${'a&b'}</b>`}</p>`), '<p><b>a&amp;b</b></p>');
  });
  test('booleans and nullish render nothing; zero survives', () => {
    assert.equal(s(html`<b>${true}${false}${null}${undefined}</b>`), '<b></b>');
    assert.equal(s(html`<b>${0}</b>`), '<b>0</b>');
    assert.equal(s(html`<b>${10n}</b>`), '<b>10</b>');
  });
  test('arrays, sets and generators flatten in order', () => {
    assert.equal(s(html`<ul>${[1, 2].map((n) => html`<li>${n}</li>`)}</ul>`), '<ul><li>1</li><li>2</li></ul>');
    assert.equal(s(html`${new Set(['a', 'b'])}`), 'ab');
    function* gen() {
      yield html`<i>1</i>`;
      yield '<';
    }
    assert.equal(s(html`${gen()}`), '<i>1</i>&lt;');
  });
  test('conditionals read naturally', () => {
    const on = true;
    assert.equal(s(html`<p>${on && html`<b>on</b>`}</p>`), '<p><b>on</b></p>');
    assert.equal(s(html`<p>${!on && html`<b>on</b>`}</p>`), '<p></p>');
  });
  test('an object is a runtime error (and a type error)', () => {
    assert.throws(() => html`<b>${{ a: 1 } as never}</b>`, { name: 'HtmlError', code: 7 });
    assert.throws(() => html`<b>${Promise.resolve('x') as never}</b>`, HtmlError);
    assert.throws(() => html`<b>${Symbol('x') as never}</b>`, { code: 7 });
  });
  test('a list is fine where only Html may go, as long as every item is', () => {
    assert.equal(s(html`<script>${[raw('1'), raw(';'), null, () => raw('x()')]}</script>`), '<script>1;x()</script>');
    assert.equal(s(html`<input ${[attrs({ a: 1 })]}>`), '<input a="1">');
    assert.throws(() => html`<input ${[attrs({ a: 1 }), 'x']}>`, { code: 6 });
  });
});

suite('Html', () => {
  test('coerces to its markup everywhere', () => {
    const h = html`<b>x</b>`;
    assert.ok(h instanceof Html);
    assert.ok(isHtml(h));
    assert.ok(!isHtml('<b>x</b>'));
    assert.equal(`${h}`, '<b>x</b>');
    assert.equal(h + '', '<b>x</b>');
    assert.equal(JSON.stringify({ h }), '{"h":"<b>x</b>"}');
    assert.equal(h.markup, '<b>x</b>'); // no coercion, and typed as a string
  });
  test('raw() with a non-string is still Html: the brand field always holds a string', () => {
    const n = raw(123 as never);
    assert.ok(isHtml(n));
    assert.equal(s(html`<b>${n}</b>`), '<b>123</b>');
  });
  test('what the brand check accepts, the renderer reads from the same slot', () => {
    // Forgeable on purpose, like raw(). What must not happen is a yes from isHtml and then
    // "undefined" in the page because the markup was read from somewhere else.
    const forged = { [Symbol.for('itsy.html')]: '<i>x</i>' } as never;
    assert.ok(isHtml(forged));
    assert.equal(s(html`<p>${forged}</p>`), '<p><i>x</i></p>');
    assert.equal(s(html`<a href="${forged}"></a>`), '<a href="<i>x</i>"></a>');
  });
  test('is an object: truthy even when empty, so coerce where a primitive is due', () => {
    assert.equal(typeof html``, 'object');
    assert.ok(html``);
    assert.equal(String(html``), '');
  });
});

suite('whitespace', () => {
  test('indentation becomes single spaces, once per site; the template edges lose theirs', () => {
    assert.equal(
      s(html`
        <ul>
          <li>${'a'}</li>
        </ul>
      `),
      '<ul> <li>a</li> </ul>',
    );
  });
  test('a newline never glues inline content together', () => {
    assert.equal(
      s(html`<span>${'John'}
${'Doe'}</span>`),
      '<span>John Doe</span>',
    );
    assert.equal(
      s(html`<b>a</b>
<i>b</i>`),
      '<b>a</b> <i>b</i>',
    );
  });
  test('inline spacing and value whitespace are untouched', () => {
    assert.equal(s(html`<b>a</b> <i>b</i>`), '<b>a</b> <i>b</i>');
    assert.equal(s(html`<p>${'a\n  b'}</p>`), '<p>a\n  b</p>');
  });
  test('<pre> and <textarea> templates are left alone', () => {
    assert.equal(s(html`<pre>\n  x\n</pre>`), '<pre>\n  x\n</pre>');
    assert.equal(s(html`<textarea>\n${'v'}\n</textarea>`), '<textarea>\nv\n</textarea>');
  });
});

suite('functions as values', () => {
  test('a function is called at render and its result rendered in place', () => {
    assert.equal(s(html`<p>${() => 'a<b'}</p>`), '<p>a&lt;b</p>');
    assert.equal(s(html`<p>${() => html`<b>${'x'}</b>`}</p>`), '<p><b>x</b></p>');
    assert.equal(s(html`<a href="${() => 'javascript:x'}"></a>`), '<a href="about:blank#blocked"></a>');
    assert.equal(s(html`<i ${() => attrs({ hidden: true })}></i>`), '<i hidden></i>');
    assert.equal(s(html`<p>${() => [1, () => 2]}</p>`), '<p>12</p>');
    assert.equal(s(html`<p>${[() => 'a', () => html`<b></b>`]}</p>`), '<p>a<b></b></p>');
  });
  test('a slot the layout declines is never built', () => {
    let built = 0;
    const footer = () => {
      built++;
      return html`<footer></footer>`;
    };
    const Card = (slot: () => Renderable, show: boolean) => html`<section>${show && slot}</section>`;
    assert.equal(s(Card(footer, false)), '<section></section>');
    assert.equal(built, 0);
    assert.equal(s(Card(footer, true)), '<section><footer></footer></section>');
    assert.equal(built, 1);
  });
  test('a thunk inside a tag must still return Html', () => {
    assert.throws(() => html`<i ${() => 'x'}></i>`, { name: 'HtmlError', code: 6 });
  });
});
