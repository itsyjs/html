import { suite, test } from 'node:test';
import assert from 'node:assert/strict';
import { HtmlError, attrs, html, raw } from '#index';

const s = (x: unknown) => String(x);
// The production build has no markup audit, so what it refuses is the scanner's decision alone.
// Where the dev build's audit reports the markup first, this is how a test sees the scanner.
// Synchronous, so nothing else runs while the switch is off.
const dev = globalThis as { __DEV__?: boolean };
const prod = (f: () => unknown) => () => {
  dev.__DEV__ = false;
  try {
    return f();
  } finally {
    dev.__DEV__ = true;
  }
};

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
    // A `>` inside a comment is text, not the end of anything.
    assert.throws(() => html`<!-- a > ${'b'} -->`, { code: 6, message: /comment/ });
  });
  test('a comment ends where the browser ends it', () => {
    // `<!-->` and `<!--->` are whole comments, and `--!>` ends one as `-->` does.
    assert.equal(s(html`<!-->${'<'}`), '<!-->&lt;');
    assert.equal(s(html`<!--->${'<'}`), '<!--->&lt;');
    assert.equal(s(html`<!-- a --!>${'<'}`), '<!-- a --!>&lt;');
    assert.throws(() => html`<!-- a ->${'x'} -->`, { code: 6 }); // one dash ends nothing
  });
  test('text after a closed script or comment is text again', () => {
    assert.equal(s(html`<script>x</script><b>${'<'}</b>`), '<script>x</script><b>&lt;</b>');
    assert.equal(s(html`<!-- c --><b>${'<'}</b>`), '<!-- c --><b>&lt;</b>');
  });
  test('right after a `<`, where the browser reads a tag name', () => {
    // A value that starts with a letter would open a tag of its own: `img src=x onerror=…`.
    assert.throws(() => html`<${'img src=x onerror=alert(1)//'}>`, { code: 6, message: /right after `<`/ });
    assert.throws(() => html`<p>a <${'b'}</p>`, { code: 6 });
    assert.throws(() => html`<p>1<${2}</p>`, { code: 6 });
    // raw() is still the deliberate way to name a tag, and a `<` with anything else after it is text.
    assert.equal(s(html`<${raw('hr')}>`), '<hr>');
    assert.equal(s(html`<p>a < ${'b'}</p>`), '<p>a < b</p>');
    assert.equal(s(html`<p>a &lt;${'b'}</p>`), '<p>a &lt;b</p>');
  });
  test('a script with a `<!--` or `<![CDATA[` still open does not end at `</script>`', () => {
    // In an HTML <script>, `<!--<script>` puts the tokenizer where `</script>` is text; in an SVG
    // one, a comment or a CDATA section does the same. The value would be code either way.
    assert.throws(() => html`<script><!--<script></script>${'\nalert(1)//'}</script>`, {
      code: 6,
      message: /still open/,
    });
    assert.throws(() => html`<svg><script><!--</script>-->${'alert(1)'}</script></svg>`, { code: 6 });
    assert.throws(() => html`<svg><script><![CDATA[</script>]]>${'alert(1)'}</script></svg>`, { code: 6 });
    assert.throws(() => html`<svg><style><!--</style>-->${'*{}'}</style></svg>`, { code: 6 });
    // Closed again, they end the block as usual.
    assert.equal(s(html`<script><!-- x --></script><b>${'<'}</b>`), '<script><!-- x --></script><b>&lt;</b>');
    assert.equal(s(html`<script><!-->x</script><b>${'<'}</b>`), '<script><!-->x</script><b>&lt;</b>');
    assert.equal(
      s(html`<svg><script><![CDATA[x]]></script><text>${'<'}</text></svg>`),
      '<svg><script><![CDATA[x]]></script><text>&lt;</text></svg>',
    );
  });
  test('a template that ends inside a tag is the audit’s to report, not a refusal', () => {
    // Nothing follows the last chunk, so there is no expression there to refuse.
    assert.throws(() => html`<p title=a`, { code: 8 });
    assert.throws(() => html`<p onclick="a`, { code: 8 });
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
    // The dev build's audit reads the quote into the name, as the browser does, and says so first.
    assert.throws(() => html`<a ="${'x'}">y</a>`, { code: 8, message: /a quote inside the attribute name/ });
    assert.throws(
      prod(() => html`<a ="${'x'}">y</a>`),
      { code: 6 },
    );
    assert.throws(
      prod(() => html`<a href="x"="${'x'}">y</a>`),
      { code: 6 },
    );
    assert.throws(
      prod(() => html`<a href/="${'x'}">y</a>`),
      { code: 6 },
    );
  });
  test('unquoted values and tag contexts are unchanged', () => {
    assert.throws(() => html`<a href=${'/x'}>y</a>`, { code: 5 });
    assert.throws(() => html`<a href= ${'/x'}>y</a>`, { code: 5 });
    assert.throws(() => html`<a href=x ${'x'}>y</a>`, { code: 6 });
    assert.equal(s(html`<a href=>${'<'}</a>`), '<a href=>&lt;</a>');
    assert.equal(s(html`<a ${attrs({ id: 'i' })}href="${'/x'}">y</a>`), '<a id="i"href="/x">y</a>');
    // No space around the expression: it still stands for attributes, so `href` starts a new one.
    assert.equal(
      s(html`<a disabled${raw(' class="c"')}href="${'javascript:x'}">y</a>`),
      '<a disabled class="c"href="about:blank#blocked">y</a>',
    );
  });
  test('after an unquoted value, a `=` starts a new attribute name, as in the browser', () => {
    // The browser reads `="` here as the start of an attribute name, so a value with a space in
    // it would write attributes of its own: `<p a=b =" onmouseover=alert(1) ">` has a handler.
    assert.throws(
      prod(() => html`<p a=b ="${' onmouseover=alert(1) '}">x</p>`),
      { code: 6 },
    );
    assert.throws(
      prod(() => html`<p a=b ='${'x'}'>x</p>`),
      { code: 6 },
    );
    assert.throws(() => html`<p a=b ="${'x'}">x</p>`, { code: 8 }); // and the audit reports it in dev
    // Inside the unquoted value, a `=` and a quote are just more of it.
    assert.throws(() => html`<p a=b="${'x'}">x</p>`, { code: 5 });
  });
  test('after an expression in a tag, a `=` starts a new attribute name', () => {
    // The expression may end with a name of its own, and the value would be that attribute's:
    // here `href`, which the scanner never saw, so its scheme would go unchecked.
    assert.throws(() => html`<a x${raw(' href')}="${'javascript:alert(1)'}">y</a>`, { code: 6 });
    assert.throws(
      prod(() => html`<a ${raw('href')}="${'javascript:alert(1)'}">y</a>`),
      { code: 6 },
    );
  });
  test('whitespace is what HTML says it is, not what JavaScript says', () => {
    // A vertical tab or a no-break space is part of a name or a value to the browser: after an `=`
    // it starts an unquoted value, after a tag name it is more of the name, and after `</script`
    // it is not the end of the script. Each would put the value somewhere escaping cannot guard.
    assert.throws(
      prod(() => html`<p a=\u000b"${' onmouseover=alert(1)'}">x</p>`),
      { code: 5 },
    );
    assert.throws(
      prod(() => html`<p a=b\u000bc="${'x'}">x</p>`),
      { code: 5 },
    );
    assert.throws(
      prod(() => html`<a\u00a0href="${' onmouseover=alert(1)'}">x</a>`),
      { code: 6 },
    );
    assert.throws(
      prod(() => html`<script>a</script\u000b><p>${'alert(1)'}</p>`),
      { code: 6 },
    );
    // A newline still collapses the whitespace around it, and only that: a no-break space is text.
    assert.equal(
      s(html`<p>a\u00a0
      b</p>`),
      '<p>a\u00a0 b</p>',
    );
  });
  test('the end tag of a script takes attribute names as any tag does', () => {
    // `</script ="…">` is an end tag whose attribute name starts with `=`: the value is in a name,
    // whatever attribute the start tag ended on.
    assert.throws(
      prod(() => html`<script async></script ="${'x'}">`),
      { code: 6 },
    );
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
