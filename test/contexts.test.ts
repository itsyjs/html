import { suite, test } from 'node:test';
import assert from 'node:assert/strict';
import { HtmlError, attrs, html, raw } from '#index';

const s = (x: unknown) => String(x);

suite('attribute values', () => {
  test('a value anywhere inside a quoted attribute is escaped for that attribute', () => {
    assert.equal(s(html`<a title="${'"'}">x</a>`), '<a title="&quot;">x</a>');
    assert.equal(s(html`<a class="a ${'b'} ${'c'}">x</a>`), '<a class="a b c">x</a>');
    assert.equal(s(html`<a class='${"'"}'>x</a>`), "<a class='&#39;'>x</a>");
  });
  test('URL attributes are scheme-checked even mid-value', () => {
    assert.equal(s(html`<a href="${'javascript:x'}">y</a>`), '<a href="about:blank#blocked">y</a>');
    assert.equal(s(html`<a href="/sok?q=${'1&2'}">y</a>`), '<a href="/sok?q=1&amp;2">y</a>');
  });
  test('event handlers refuse dynamic values; srcdoc is just escaped', () => {
    assert.throws(() => html`<a onclick="${'x'}">y</a>`, /refusing/);
    assert.equal(s(html`<iframe srcdoc="${'<b>'}"></iframe>`), '<iframe srcdoc="&lt;b&gt;"></iframe>');
    assert.throws(() => attrs({ onclick: 'x' }), /refusing/);
  });
  test('unquoted attribute values are a mistake, caught once', () => {
    assert.throws(() => html`<a href=${'/x'}>y</a>`, /quote the attribute/);
    assert.throws(() => html`<a href= ${'/x'}>y</a>`, /quote the attribute/);
  });
});

suite('contexts that only accept Html', () => {
  test('inside a tag', () => {
    const busy: boolean = false;
    assert.throws(() => html`<input ${'disabled'}>`, /inside a tag/);
    assert.throws(() => html`<input ${true}>`, /inside a tag/);
    assert.equal(s(html`<input ${attrs({ disabled: true })}>`), '<input disabled>');
    assert.equal(s(html`<input ${busy && attrs({ disabled: true })}>`), '<input >');
  });
  test('inside <script> and <style>', () => {
    assert.throws(() => html`<script>${'var x'}</script>`, /<script>/);
    assert.throws(() => html`<style>${'a{}'}</style>`, /<style>/);
    assert.equal(s(html`<script>${raw('{"x":1}')}</script>`), '<script>{"x":1}</script>');
    assert.equal(s(html`<script type="module">${raw('x()')}</script>`), '<script type="module">x()</script>');
  });
  test('inside a comment', () => {
    assert.throws(() => html`<!-- ${'-->'} -->`, /comment/);
  });
  test('text after a closed script or comment is text again', () => {
    assert.equal(s(html`<script>x</script><b>${'<'}</b>`), '<script>x</script><b>&lt;</b>');
    assert.equal(s(html`<!-- c --><b>${'<'}</b>`), '<!-- c --><b>&lt;</b>');
  });
});

suite('scanner robustness', () => {
  test('doctype, closing tags, self-closing and custom elements', () => {
    assert.equal(s(html`<!doctype html><my-el a="1"></my-el>${'<'}`), '<!doctype html><my-el a="1"></my-el>&lt;');
    assert.equal(s(html`<div></div>${'<'}`), '<div></div>&lt;');
  });
  test('a > inside a quoted attribute does not end the tag', () => {
    assert.throws(() => html`<a title="x>y" ${'bad'}></a>`, /inside a tag/);
  });
  test('a malformed href=> still closes the tag', () => {
    assert.equal(s(html`<a href=>${'<'}</a>`), '<a href=>&lt;</a>');
  });
  test('the same site renders different values; sites do not leak into each other', () => {
    const t = (v: string) => html`<b>${v}</b>`;
    assert.equal(s(t('a')), '<b>a</b>');
    assert.equal(s(t('<')), '<b>&lt;</b>');
    assert.equal(s(html`<i>${'x'}</i>`), '<i>x</i>');
  });
  test('errors name the expression', () => {
    assert.throws(
      () => html`<script>${'x'}</script>`,
      (e: unknown) => e instanceof HtmlError && e.name === 'HtmlError' && /expression 0/.test(e.message),
    );
  });
});

suite('error codes', () => {
  test('every refusal carries a stable code', () => {
    assert.throws(() => html`<a href=${'x'}>`, { name: 'HtmlError', code: 5 });
    assert.throws(() => html`<i ${'x'}></i>`, { code: 6 });
    assert.throws(() => html`<script>${'x'}</script>`, { code: 6 });
    assert.throws(() => html`<a onclick="${'x'}"></a>`, { code: 3 });
  });
});

suite('scanner: attribute names survive separators', () => {
  test('whitespace or a slash before the = still names the attribute', () => {
    assert.equal(s(html`<a href ="${'javascript:x'}">y</a>`), '<a href ="about:blank#blocked">y</a>');
    assert.equal(s(html`<a href = "${'javascript:x'}">y</a>`), '<a href = "about:blank#blocked">y</a>');
    assert.equal(
      s(html`<a
        href="${'javascript:x'}">y</a>`),
      '<a href="about:blank#blocked">y</a>',
    );
    assert.equal(s(html`<a/href="${'javascript:x'}">y</a>`), '<a/href="about:blank#blocked">y</a>');
    assert.equal(s(html`<a disabled href="${'javascript:x'}">y</a>`), '<a disabled href="about:blank#blocked">y</a>');
    assert.equal(s(html`<a href title="${'javascript:x'}">y</a>`), '<a href title="javascript:x">y</a>');
    assert.throws(() => html`<a onclick ="${'x'}">y</a>`, { code: 3 });
    assert.throws(() => html`<a/onclick="${'x'}">y</a>`, { code: 3 });
  });
  test('a name glued to a closing quote is a new attribute, not part of the tag name', () => {
    assert.equal(s(html`<a title="t"class="${'"'}">y</a>`), '<a title="t"class="&quot;">y</a>');
    assert.throws(() => html`<a href="x"onclick="${'x'}">y</a>`, { code: 3 });
    assert.throws(() => html`<script src="x"async>${'x'}</script>`, { code: 6 });
  });
  test('a = with no name before it starts an attribute name, so the expression is inside the tag', () => {
    assert.throws(() => html`<a ="${'x'}">y</a>`, { code: 6 });
    assert.throws(() => html`<a href="x"="${'x'}">y</a>`, { code: 6 });
    assert.throws(() => html`<a href/="${'x'}">y</a>`, { code: 6 });
  });
  test('unquoted values and tag contexts are unchanged', () => {
    assert.throws(() => html`<a href=${'/x'}>y</a>`, { code: 5 });
    assert.throws(() => html`<a href= ${'/x'}>y</a>`, { code: 5 });
    assert.throws(() => html`<a href=x ${'x'}>y</a>`, { code: 6 });
    assert.equal(s(html`<a href=>${'<'}</a>`), '<a href=>&lt;</a>');
    assert.equal(s(html`<a ${attrs({ id: 'i' })}href="${'/x'}">y</a>`), '<a id="i"href="/x">y</a>');
  });
  test('end tags of <script> and <style> match in any case, and only as whole names', () => {
    assert.equal(s(html`<SCRIPT>x</SCRIPT><b>${'<'}</b>`), '<SCRIPT>x</SCRIPT><b>&lt;</b>');
    assert.equal(s(html`<style>a{}</STYLE ><b>${'<'}</b>`), '<style>a{}</STYLE ><b>&lt;</b>');
    assert.throws(() => html`<script>x</scripts><b>${'<'}</b></script>`, { code: 6 });
  });
});

suite('Html inside attributes', () => {
  test('is not escaped again, but a URL attribute still checks the scheme', () => {
    assert.equal(s(html`<a href="${raw('/a?b=1&amp;c=2')}">y</a>`), '<a href="/a?b=1&amp;c=2">y</a>');
    assert.equal(s(html`<a href="${html`${'/a?b=1&c=2'}`}">y</a>`), '<a href="/a?b=1&amp;c=2">y</a>');
    assert.equal(s(html`<a href="${raw('javascript:x')}">y</a>`), '<a href="about:blank#blocked">y</a>');
    assert.equal(s(html`<a href="${html`${'javascript:x'}`}">y</a>`), '<a href="about:blank#blocked">y</a>');
    assert.equal(s(html`<a href="${[raw('javascript:x')]}">y</a>`), '<a href="about:blank#blocked">y</a>');
    assert.equal(s(html`<a href="${() => raw('javascript:x')}">y</a>`), '<a href="about:blank#blocked">y</a>');
    assert.equal(s(html`<a title="${raw('&amp;')}">y</a>`), '<a title="&amp;">y</a>');
  });
  test('on* refuses every value: strings, Html, nothing', () => {
    assert.throws(() => html`<a onclick="${html`f()`}">y</a>`, { code: 3 });
    assert.throws(() => html`<a onclick="${null}">y</a>`, { code: 3 });
    assert.throws(() => html`<a onclick="go(${1})">y</a>`, { code: 3 });
    assert.throws(() => html`<a ONCLICK="${'x'}">y</a>`, { code: 3, message: /refusing/ });
  });
});
