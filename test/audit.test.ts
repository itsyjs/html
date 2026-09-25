import { suite, test } from 'node:test';
import assert from 'node:assert/strict';
import { attrs, html, raw } from '#index';
import { check } from '#check';
import type { Finding, RuleSet } from '#check';

const s = (x: unknown) => String(x);
const codes = (markup: unknown) => check(s(markup), { a11y: false }).map((p) => p.code);

suite('template audit: what the parser would repair', () => {
  test('8: a tag never closed with >', () => {
    assert.throws(() => html`<div class="foo" <p>hello</p></div>`, { code: 8, message: /never closed with `>`/ });
    assert.throws(() => html`<div class="foo"`, { code: 8 });
    assert.throws(() => html`<div class"foo">x</div>`, { code: 8, message: /missing `=`/ });
  });
  test('9: an element still open at the end, innermost first', () => {
    assert.throws(() => html`<div><p>hello</p>`, { code: 9, message: /`<div>` is never closed.*raw\(\)/ });
    assert.throws(() => html`<div><span>x`, { code: 9, message: /`<span>` is never closed/ });
    assert.throws(() => html`<ul><li>a<li>b</ul>`, { code: 9, message: /`<li>` is never closed: `<li>` starts/ });
    assert.throws(() => html`<p>${'x'}`, { code: 9 });
  });
  test('10: a close tag that matches nothing, or the wrong element', () => {
    assert.throws(() => html`<b><i>x</b></i>`, { code: 10, message: /`<\/b>` closes `<i>`: expected `<\/i>` first/ });
    assert.throws(() => html`</div>`, { code: 10, message: /closes nothing/ });
    assert.throws(() => html`<p><div>x</div></p>`, { code: 9, message: /`<p>` is never closed: `<div>` starts/ });
    assert.throws(() => html`<div><p>x</div>`, { code: 10, message: /`<\/div>` closes `<p>`/ });
  });
  test('11: /> on a non-void element', () => {
    assert.throws(() => html`<div />`, { code: 11, message: /Write `<div><\/div>`/ });
    assert.throws(() => html`<my-el a="1" />`, { code: 11 });
    assert.doesNotThrow(() => html`<br/><img src="x"/><input/>`);
    assert.doesNotThrow(() => html`<svg viewBox="0 0 1 1"><g><path d="M0 0"/><circle r="1"/></g></svg><svg/>`);
  });
  test('12: an end tag on a void element', () => {
    assert.throws(() => html`<br></br>`, { code: 12, message: /second <br>/ });
    assert.throws(() => html`<img src="x"></img>`, { code: 12, message: /ignores it/ });
  });
  test('13: nesting the parser rewrites', () => {
    assert.throws(() => html`<a href="/"><a href="/x">y</a></a>`, {
      code: 13,
      message: /`<a>` cannot be a child of `<a>`/,
    });
    assert.throws(() => html`<button><span><button>x</button></span></button>`, { code: 13 });
    assert.throws(() => html`<h1><h2>x</h2></h1>`, { code: 13 });
    assert.throws(() => html`<form><div><form></form></div></form>`, { code: 13 });
    assert.throws(() => html`<table><tr><td>x</td></tr></table>`, {
      code: 13,
      message: /`<tr>` cannot be a child of `<table>`/,
    });
    assert.throws(() => html`<p><span><div>x</div></span></p>`, {
      code: 13,
      message: /`<div>` cannot be inside `<p>`/,
    });
  });
  test('14: the same attribute twice on one tag', () => {
    assert.throws(() => html`<a class="x" class="${'y'}">z</a>`, { code: 14, message: /`class` appears twice/ });
  });
  test('legal HTML passes: voids, raw text, comments, custom elements', () => {
    assert.doesNotThrow(() => html`<dd><dl><dt>x</dt></dl></dd>`);
    assert.doesNotThrow(() => html`<input><br><img src="x"><hr>`);
    assert.doesNotThrow(() => html`<script>if (a < b && c > d) { "</div>" }</script>`);
    assert.doesNotThrow(() => html`<style>a > b { }</style>`);
    assert.doesNotThrow(() => html`<textarea><div></textarea>`);
    assert.doesNotThrow(() => html`<!-- <div> --><!doctype html>a < b<a title="x > y">x</a>`);
    assert.doesNotThrow(() => html`<a href=/x>y</a><a href = "/x">y</a>`);
    assert.doesNotThrow(() => html`<my-el><td>x</td></my-el>`);
    assert.doesNotThrow(() => html`<p><template><div>x</div></template></p>`);
    assert.doesNotThrow(() => html`<div ${attrs({ class: 'x' })}>x</div>`);
    assert.doesNotThrow(() => html`<svg><foreignObject><br><div><p>x</p></div></foreignObject></svg>`);
    assert.doesNotThrow(() => html`<script>"</scripts>"</script>`);
  });
  test('omitted end tags are reported, even where the spec allows them', () => {
    assert.throws(() => html`<ul><li>a<li>b</ul>`, { code: 9 });
    assert.throws(() => html`<select><option>a<option>b</select>`, { code: 9 });
    assert.throws(() => html`<table><tbody><tr><td>a<td>b</table>`, { code: 9 });
    assert.throws(() => html`<dl><dt>a<dd>b<dd>c</dl>`, { code: 9 });
    assert.throws(() => html`<li>${'x'}`, { code: 9 });
    assert.throws(() => html`<td>${'x'}`, { code: 9 });
    assert.throws(() => html`<option value="1">`, { code: 9 });
    assert.throws(() => html`<div><p>x</div>`, { code: 10 });
  });
  test('an end tag with no name is a comment to the browser, and to the audit', () => {
    // `</ b` opens a comment that runs to the next `>`, so it swallows the `</p>`: the <p> stays open.
    assert.throws(() => html`<p>a </ b</p>`, { code: 9, message: /`<p>` is never closed/ });
    assert.doesNotThrow(() => html`<p>a</>b</p>`); // `</>` is dropped, and nothing else goes with it
  });
  test('a deliberately unmatched tag goes through raw()', () => {
    assert.doesNotThrow(() => html`${raw('<div class="wrapper">')}<p>x</p>`);
    assert.doesNotThrow(() => html`<p>x</p>${raw('</div>')}`);
  });
  test('whitespace between table parts is no text to move', () => {
    assert.doesNotThrow(() => html`<table> <tbody> <tr> <td>x</td> </tr> </tbody> </table>`);
  });
});

// What the parser closes on its own (9) and what it drops, folds in or moves (13), each case
// as parse5 builds it. The clean cases are the near-misses: nesting the parser keeps as written.
suite('the parser, element by element', () => {
  const first = (markup: string) => check(markup, { a11y: false })[0];
  test('the tags that close an open <p>', () => {
    for (const tag of ['center', 'dir', 'div', 'listing', 'plaintext', 'xmp', 'h2', 'hr', 'table', 'dd']) {
      assert.equal(first(`<p>a<${tag}>`)?.code, 9, tag);
      assert.equal(first(`<p>a<${tag}>`)?.at, 0, tag);
    }
    assert.deepEqual(codes('<p>a<span>b</span></p>'), []);
    // A <button> or an <object> is where the parser stops looking for the <p>, so it stays open.
    assert.deepEqual(codes('<p><button><div>x</div></button></p>'), []);
    assert.deepEqual(codes('<p><object><div>x</div></object></p>'), []);
    assert.deepEqual(codes('<p><span><div>x</div></span></p>'), [13]);
  });
  test('where the parser stops looking for an element to close', () => {
    // A heading closes a heading it is the direct child of, and no other.
    assert.deepEqual(codes('<h1><h2>x</h2></h1>'), [13]);
    assert.deepEqual(codes('<h1><span><h2>x</h2></span></h1>'), []);
    // An <a> or a <button> is split around a new one, but not past an <object>.
    assert.deepEqual(codes('<a href="/"><object><a href="/x">y</a></object></a>'), []);
    assert.deepEqual(codes('<button><object><button>x</button></object></button>'), []);
    // Outside a <select>, an <hr> or a group closes no option and no group.
    assert.deepEqual(codes('<option>a<hr></option>'), []);
    assert.deepEqual(codes('<optgroup label="g"><optgroup label="h"></optgroup></optgroup>'), []);
    assert.deepEqual(codes('<option>a<option>b</option></option>'), [9, 10]);
  });
  test('an <hr> closes an open option or group, as the next option does', () => {
    assert.deepEqual(codes('<select><option>a<hr></select>'), [9]);
    assert.deepEqual(codes('<select><optgroup label="g"><option>a<hr></select>'), [9, 9]);
    assert.deepEqual(codes('<select><option>a</option><hr><option>b</option></select>'), []);
  });
  test('a table part closes the cell, row, section or caption it cannot sit in', () => {
    const t = (inner: string) => codes(`<table>${inner}</table>`);
    assert.deepEqual(t('<caption>a<tbody><tr><td>x</td></tr></tbody>'), [9]);
    assert.deepEqual(t('<thead><tr><th>a</th></tr><tbody><tr><td>x</td></tr></tbody>'), [9]);
    assert.deepEqual(t('<tbody><tr><td>a</td></tr><tfoot><tr><td>x</td></tr></tfoot>'), [9]);
    assert.deepEqual(t('<tfoot><tr><td>a</td></tr><tbody><tr><td>x</td></tr></tbody>'), [9]);
    assert.deepEqual(t('<tbody><tr><td>a</td><tr><td>x</td></tr></tbody>'), [9]);
    assert.deepEqual(t('<tbody><tr><th>a<td>x</td></tr></tbody>'), [9]);
    assert.deepEqual(t('<tbody><tr><td>a<tbody><tr><td>x</td></tr></tbody>'), [9, 9, 9]);
    // Deeper inside the cell it is still the cell that closes, which the audit reports, not repairs.
    assert.deepEqual(t('<tbody><tr><td><div><tr></tr></div></td></tr></tbody>'), [13]);
    // A table inside the cell is a table of its own.
    assert.deepEqual(t('<tbody><tr><td><table><tbody><tr><td>x</td></tr></tbody></table></td></tr></tbody>'), []);
  });
  test('inside a <ruby>, an annotation closes what an implied end tag closes', () => {
    assert.deepEqual(codes('<ruby>a<rt>b<rp>c</rp></ruby>'), [9]);
    assert.deepEqual(codes('<ruby><rb>a<rt>b</rt></ruby>'), [9]);
    assert.deepEqual(codes('<ruby><p>a<rt>b</rt></ruby>'), [9]);
    // …except that an <rt> or <rp> may sit in an <rtc>, and outside a <ruby> nothing closes.
    assert.deepEqual(codes('<ruby>a<rtc><rt>b</rt></rtc></ruby>'), []);
    assert.deepEqual(codes('<rt>a<rp>b</rp></rt>'), []);
  });
  test('a new <li>, <dd> or <dt> closes the one before it, unless a special element sits between', () => {
    assert.deepEqual(codes('<ul><li><span><li>x</li></span></li></ul>'), [13]);
    assert.deepEqual(codes('<ul><li><div><li>x</li></div></li></ul>'), [13]);
    assert.deepEqual(codes('<ul><li><ul><li>x</li></ul></li></ul>'), []);
    assert.deepEqual(codes('<dl><dt><ul><dd>x</dd></ul></dt></dl>'), []);
    assert.deepEqual(codes('<dl><dt><span><dd>x</dd></span></dt></dl>'), [13]);
  });
  test('tags the browser drops, or folds into the element it already has', () => {
    assert.deepEqual(codes('<div><tr><td>x</td></tr></div>'), [13]);
    assert.deepEqual(codes('<select><tr></tr></select>'), [13]);
    assert.deepEqual(codes('<html><body><html></html></body></html>'), [13]);
    assert.deepEqual(codes('<html><body><div><body></body></div></body></html>'), [13]);
    assert.deepEqual(codes('<html><head></head><head></head></html>'), [13]);
    assert.deepEqual(codes('<div><head></head></div>'), [13]);
    // A piece of a table, on its own, is how a row component starts.
    assert.deepEqual(codes('<tr><td>x</td></tr>'), []);
    assert.deepEqual(codes('<template><tr><td>x</td></tr></template>'), []);
  });
  test('an <svg> or <math> in a table is placed like any element that is not a table part', () => {
    assert.deepEqual(codes('<table><svg></svg></table>'), [13]);
    assert.deepEqual(codes('<table><tbody><tr><math></math></tr></tbody></table>'), [13]);
    assert.deepEqual(codes('<table><tbody><tr><td><svg viewBox="0 0 1 1"/></td></tr></tbody></table>'), []);
    assert.deepEqual(codes('<body></body><svg></svg>'), [13]);
  });
  test('a <nobr> inside a <nobr> is moved out', () => {
    assert.deepEqual(codes('<nobr>a<nobr>b</nobr></nobr>'), [13]);
    assert.deepEqual(codes('<nobr>a</nobr><nobr>b</nobr>'), []);
  });
  test('only a table part goes in a table section, and each nesting is reported once', () => {
    assert.deepEqual(codes('<table><thead><div>x</div></thead></table>'), [13]);
    assert.deepEqual(codes('<table><tfoot><div>x</div></tfoot></table>'), [13]);
    // Every <a> is inside two others, but one report says it.
    assert.deepEqual(codes('<a href="/"><a href="/"><a href="/">x</a></a></a>'), [13, 13]);
  });
  test('the parser looks for an open <ruby> only as far as the edge of a scope', () => {
    // An <object> is such an edge, so the <rt> in it closes nothing outside.
    assert.deepEqual(codes('<ruby><object><p>a<rt>b</rt></p></object></ruby>'), []);
  });
  test('an HTML tag inside SVG closes the SVG, and what follows is HTML', () => {
    assert.deepEqual(codes('<svg><div></div></svg>'), [13, 10]);
    // After a <foreignObject> has closed, the SVG around it is SVG again.
    assert.deepEqual(codes('<svg><foreignObject></foreignObject><g><div></div></g></svg>'), [13, 10, 10]);
    assert.deepEqual(codes('<image src="a.png">'), [13]); // read as <img>, which is void
    assert.deepEqual(trace('<p><svg/></p>'), [
      'open p@0 [] {}',
      'open svg@3 [p] {}',
      'close svg@3 false', // whole, as it would be inside SVG
      'close p@0 false',
      'end ',
    ]);
  });
  test('a hidden <input> may sit in a table, and attributes we cannot see might make it one', () => {
    assert.doesNotThrow(() => html`<table><tbody><tr><td>x</td></tr></tbody><input type="hidden" name="n"></table>`);
    assert.doesNotThrow(
      () => html`<table><tbody><tr><td>x</td></tr></tbody><input ${attrs({ type: 'hidden' })}></table>`,
    );
    assert.throws(() => html`<table><tbody><tr><td>x</td></tr></tbody><input name="n"></table>`, { code: 13 });
  });
  test('a raw-text element ends only at its own end tag, not at a longer name', () => {
    assert.deepEqual(codes('<title>a</titles>b</title><textarea>c</textareas>d</textarea>'), []);
  });
  test('an attribute name may start with `=`, and only HTML whitespace ends a name', () => {
    assert.deepEqual(trace('<a =x>y</a>')[0], 'open a@0 [] {=x=}'); // one attribute, `=x`, with no value
    // A vertical tab is part of the tag name, so this is an <a\u000bhref="x"> with no end tag.
    assert.deepEqual(codes('<a\u000bhref="x">y</a>'), [9, 10]);
  });
});

suite('check(): the output validator', () => {
  test('returns problems in document order, with position and context', () => {
    assert.deepEqual(check('<div>'), [{ code: 9, message: '`<div>` is never closed', at: 0, near: '<div>' }]);
    assert.deepEqual(codes('<b><i>x</b><br></br>'), [10, 12]);
    assert.deepEqual(codes('<div />'), [11, 9]);
    // A whole, valid document: clean with the accessibility rules on, which is the default.
    assert.deepEqual(
      check('<!doctype html><html lang="en"><head><title>t</title></head><body><p>x</p></body></html>'),
      [],
    );
    assert.deepEqual(codes('<!doctype html><html><head><title>t</title></head><body><p>x</body></html>'), [10]);
  });
  test('sees across templates and through attrs() spreads', () => {
    const inner = html`<div>x</div>`;
    const outer = html`<p>${inner}</p>`;
    assert.deepEqual(codes(outer), [9, 10]); // the <p> is left open by <div>, then </p> closes nothing
    assert.deepEqual(codes(html`<a class="x" ${attrs({ class: 'y' })}>z</a>`), [14]);
  });
  test('15 and 16: dangling id references and duplicate ids', () => {
    assert.deepEqual(codes('<label for="a">x</label>'), [15]);
    assert.match(check('<i id="a"></i><b aria-labelledby="a b"></b>')[0]!.message, /aria-labelledby="b"/);
    assert.deepEqual(codes('<i id="a"></i><i id="a"></i>'), [16]);
    assert.deepEqual(check('<label for="a">x</label>', { ids: false }), []);
    // A repeated id attribute is 14, not 16 as well: the browser keeps the first, so there is one id.
    assert.deepEqual(codes('<i id="a" id="a"></i>'), [14]);
    assert.deepEqual(codes('<input id="a" id="b"><label for="b">x</label>'), [14, 15]); // and b is nowhere
  });
  test('19: a URL the guard blocked, through a template, attrs() and raw()', () => {
    assert.deepEqual(codes(html`<a href="${'javascript:x'}">y</a>`), [19]);
    assert.match(check(html`<img src="${'vbscript:x'}">`)[0]!.message, /src="about:blank#blocked"/);
    assert.deepEqual(codes(html`<form ${attrs({ action: 'ftp://x' })}></form>`), [19]);
    assert.deepEqual(codes(html`<a href="${'/ok'}">y</a><a href="${'data:image/png;base64,x'}">y</a>`), []);
    assert.deepEqual(codes(html`<a href="${'javascript:x'}">y</a>`.toString()), [19]); // the string is enough
    assert.deepEqual(
      check(html`<a href="${'javascript:x'}">y</a>`, { ids: false, a11y: false }).map((p) => p.code),
      [19],
    ); // ids off does not turn it off
    assert.doesNotThrow(() => html`<a href="about:blank#blocked">y</a>`); // a template audit never reports it
  });
  test('popovertarget, commandfor and itemref are id references too', () => {
    assert.deepEqual(codes('<button popovertarget="p">x</button>'), [15]);
    assert.deepEqual(codes('<button popovertarget="p" commandfor="p">x</button><div id="p" popover></div>'), []);
    assert.deepEqual(codes('<div itemref="a b"></div><i id="a"></i>'), [15]);
  });
  test('a Turkish dotted capital I does not shift every offset after it', () => {
    // '\u0130'.toLowerCase() is two characters. Lowercasing the whole string used to shift every
    // index after it and break the scan: this threw code 10, and check() reported four problems.
    assert.doesNotThrow(() => html`<h1>\u0130stanbul</h1>`);
    assert.equal(String(html`<p title="\u0130x">y</p>`), '<p title="\u0130x">y</p>');
    assert.deepEqual(codes('<nav aria-label="\u0130stanbul"><a href="/">Ev</a></nav>'), []);
    assert.deepEqual(codes('<p>\u0130</p><div>'), [9]); // and the offsets after it are still right
    assert.deepEqual(codes('<P>\u0130</P>'), []); // ASCII names still lowercase
  });
  test('foreign content: svg self-closes, a foreignObject is HTML again', () => {
    assert.deepEqual(codes('<svg><path d="M0 0"/><foreignObject><br></foreignObject></svg>'), []);
    assert.deepEqual(codes('<svg><foreignObject><div />x</foreignObject></svg>'), [11, 10]);
  });
});

// What a rule set sees. These pin the contract src/a11y.ts is written against, so a change
// here breaks loudly instead of quietly misinforming a rule.
const trace = (markup: string, ids = true) => {
  const log: string[] = [];
  const spy: RuleSet = () => ({
    open: (tag, a, at, anc) =>
      log.push(`open ${tag}@${at} [${anc.join('>')}] {${[...a].map(([k, v]) => `${k}=${v}`).join(',')}}`),
    close: (tag, at, hadText) => log.push(`close ${tag}@${at} ${hadText}`),
    end: (map) => log.push(`end ${[...map.keys()].join(',')}`),
  });
  check(markup, { ids, a11y: false, rules: spy });
  return log;
};
const found = (markup: string, rule: RuleSet) =>
  check(markup, { a11y: false, rules: rule }).filter((p) => 'rule' in p) as Finding[];

suite('the visitor a rule set is handed', () => {
  test('void elements open but never close, and are not text', () => {
    assert.deepEqual(trace('<p><img src="a"><br></p>'), [
      'open p@0 [] {}',
      'open img@3 [p] {src=a}',
      'open br@16 [p] {}',
      'close p@0 false', // an element holding only images holds no text
      'end ',
    ]);
  });
  test('ancestors are the real ones: whatever the browser closed is closed first', () => {
    assert.deepEqual(trace('<p>text<div>x</div>'), [
      'open p@0 [] {}',
      'close p@0 true', // the browser closes <p> here, so a rule sees it close before <div> opens
      'open div@7 [] {}',
      'close div@7 true',
      'end ',
    ]);
  });
  test('attribute names lowercase, values verbatim, a bare attribute is present and empty', () => {
    const [img] = trace('<IMG SRC="/A.png" ALT Data-X="Keep Me">');
    assert.equal(img, 'open img@0 [] {src=/A.png,alt=,data-x=Keep Me}');
  });
  test('text bubbles up, whitespace is not text', () => {
    assert.deepEqual(trace('<button><span>Save</span></button>').slice(2), [
      'close span@8 true',
      'close button@0 true',
      'end ',
    ]);
    assert.deepEqual(trace('<h2> \n </h2>'), ['open h2@0 [] {}', 'close h2@0 false', 'end ']);
  });
  test('the text inside a jumped-over element still counts', () => {
    assert.deepEqual(trace('<title>Hi</title><style> </style>').slice(1, 4), [
      'close title@0 true',
      'open style@17 [] {}',
      'close style@17 false',
    ]);
  });
  test('close reports where the element started', () => {
    assert.deepEqual(trace('<section><i>x</i></section>').slice(2), ['close i@9 true', 'close section@0 true', 'end ']);
  });
  test('a repeated attribute is handed on with its first value, the one the browser keeps', () => {
    assert.deepEqual(trace('<img alt="" alt="x">')[0], 'open img@0 [] {alt=}');
    assert.deepEqual(trace('<i id="a" id="b"></i>').at(-1), 'end a');
  });
  test('ancestors are a copy, so a rule set can keep them', () => {
    const kept: (readonly string[])[] = [];
    const spy: RuleSet = () => ({ open: (_tag, _a, _at, anc) => kept.push(anc) });
    check('<div><p><b>x</b></p></div><span></span>', { a11y: false, rules: spy });
    assert.deepEqual(kept, [[], ['div'], ['div', 'p'], []]);
  });
  test('every id reaches end(), even with the id checks turned off', () => {
    assert.deepEqual(trace('<i id="a"></i><b id="b"></b>', false).at(-1), 'end a,b');
    assert.deepEqual(trace('<i id="a"></i><b id="b"></b>', true).at(-1), 'end a,b');
  });
  test('findings carry a rule name and the markup near it, and sort into page order', () => {
    const rule: RuleSet = (report) => ({
      open: (tag, a, at) => {
        if (tag === 'img' && !a.has('alt')) report('img-alt', `\`<img>\` has no \`alt\``, at);
      },
    });
    const out = check('<a href="x">y</a><img src="b"><img src="c" alt="">', { a11y: false, rules: rule });
    assert.deepEqual(
      out.map((p) => ('rule' in p ? p.rule : p.code)),
      ['img-alt'],
    );
    assert.match((out[0] as Finding).near, /<img src="b">/);
    assert.equal((out[0] as Finding).at, 17);
  });
  test('markup problems and findings come back in one list, in page order', () => {
    const rule: RuleSet = (report) => ({ open: (tag, _a, at) => tag === 'img' && report('seen-img', 'an image', at) });
    assert.deepEqual(
      found('<img src="a"><div>', rule).map((f) => f.rule),
      ['seen-img'],
    );
    const mixed = check('<img src="a"><div>', { a11y: false, rules: rule });
    assert.deepEqual(
      mixed.map((p) => ('rule' in p ? p.rule : p.code)),
      ['seen-img', 9],
    );
  });
  test('no rule set, no findings, and the markup problems are untouched', () => {
    assert.deepEqual(codes('<div>'), [9]);
    assert.deepEqual(check('<div>').length, 1);
  });
  test('a self-closing element in foreign content still closes', () => {
    // Without this the rule set waits forever for an element that never ends, and the close of
    // whatever was watching around it never lands.
    assert.deepEqual(trace('<svg><a href="/x"/></svg>'), [
      'open svg@0 [] {}',
      'open a@5 [svg] {href=/x}',
      'close a@5 false',
      'close svg@0 false',
      'end ',
    ]);
  });
  test('foreign content still reports', () => {
    assert.deepEqual(trace('<svg><title>Map</title></svg>'), [
      'open svg@0 [] {}',
      'open title@5 [svg] {}',
      'close title@5 true',
      'close svg@0 true',
      'end ',
    ]);
  });
});

// The text hook, rule-set composition and `check.enabled`: the parts of the dev surface a project
// builds its own rules on. The contract is pinned here, not left to the a11y suite.
const texts = (markup: Parameters<typeof check>[0]) => {
  const log: [string, number][] = [];
  const spy: RuleSet = () => ({ text: (content, at) => log.push([content, at]) });
  check(markup, { a11y: false, rules: spy });
  return log;
};

suite('the text hook', () => {
  test('gives each run between two tags, as written, with its offset', () => {
    assert.deepEqual(texts('<p>hello <b>world</b></p>'), [
      ['hello ', 3],
      ['world', 12],
    ]);
  });
  test('text arrives as written: entities undecoded, escaped values already escaped', () => {
    assert.deepEqual(
      texts(html`<p>a &amp; ${'b'}</p>`).map(([t]) => t),
      ['a &amp; b'], // the entity is left alone, and `b` needed no escaping
    );
    assert.deepEqual(
      texts(html`<p>${'x < y'}</p>`).map(([t]) => t),
      ['x &lt; y'], // check() reads a rendered page, so it sees what the renderer wrote
    );
  });
  test('reaches the body of raw-text elements, which the walk otherwise jumps', () => {
    assert.deepEqual(texts('<title>Sales</title>'), [['Sales', 7]]);
    assert.deepEqual(texts('<textarea>  x  </textarea>'), [['  x  ', 10]]);
    assert.deepEqual(texts('<script>if (a < b) {}</script>'), [['if (a < b) {}', 8]]);
  });
  test('fires for text outside any element, and not for an empty run', () => {
    assert.deepEqual(texts('x<br>y'), [
      ['x', 0],
      ['y', 5],
    ]);
    assert.deepEqual(texts('<p></p>'), []);
    assert.deepEqual(texts('<title></title><script></script>'), []); // a raw-text body is no different
  });
  test('a `<` that opens no tag is part of the run, as the browser reads it', () => {
    assert.deepEqual(texts('<p>a < b</p>'), [['a < b', 3]]);
    assert.deepEqual(texts('<p>1 <3 2</p>'), [['1 <3 2', 3]]);
    assert.deepEqual(texts('<p><</p>'), [['<', 3]]);
    assert.deepEqual(texts('a <'), [['a <', 0]]);
    assert.deepEqual(texts('a </'), [['a </', 0]]); // at the very end, even `</` is text
    // An end tag with no name is not text: the browser makes `</ x>` a comment and drops `</>`.
    assert.deepEqual(texts('<p>a</ x>b</p>'), [
      ['a', 3],
      ['b', 9],
    ]);
    assert.deepEqual(texts('<p>a</>b</p>'), [
      ['a', 3],
      ['b', 7],
    ]);
    // A comment still ends a run, and so does anything that does open a tag.
    assert.deepEqual(texts('<p>a<!-- c -->b <i>c</i></p>'), [
      ['a', 3],
      ['b ', 14],
      ['c', 19],
    ]);
  });
  test('whitespace is still not text as far as close() is concerned', () => {
    // The hook sees the run; `close` reports whether any of it was non-whitespace.
    assert.deepEqual(texts('<p>   </p>'), [['   ', 3]]);
    assert.deepEqual(trace('<p>   </p>'), ['open p@0 [] {}', 'close p@0 false', 'end ']);
  });
});

suite('rule sets compose', () => {
  const seen =
    (name: string): RuleSet =>
    (report) => ({
      open: (tag, _a, at) => tag === 'img' && report(name, name, at),
    });

  test('several sets run in one pass and report into one list, in page order', () => {
    const out = check('<div><img src="a"></div>', { a11y: false, rules: [seen('one'), seen('two')] });
    assert.deepEqual(
      out.map((p) => ('rule' in p ? p.rule : p.code)),
      ['one', 'two'],
    );
  });
  test('a single rule set may be passed without an array', () => {
    assert.deepEqual(
      found('<img src="a">', seen('one')).map((f) => f.rule),
      ['one'],
    );
  });
  test('project rules and the accessibility rules run together', () => {
    const out = check('<img src="a">', { rules: seen('house') });
    // Both fire from `open` at offset 0, and the sort is stable, so this also pins the order:
    // built-in first. On a tie, report order decides, so a finding from `close` comes after one
    // from `open` at the same offset, whichever set reported it.
    assert.deepEqual(
      out.map((p) => ('rule' in p ? p.rule : p.code)),
      ['img-alt', 'house'],
    );
  });
  test('composed with a project’s rules, the accessibility rules lose nothing', () => {
    // Passing `rules` at all puts the built-in rules behind the composition, so every hook must
    // pass through it. `close` reports the empty button, `end` the label pointing at a <b>, and
    // `text` names the link. Without `text`, the link would be reported empty.
    const page = '<button></button><label for="x">y</label><b id="x"></b><a href="/">Home</a>';
    const names = (r: ReturnType<typeof check>) => r.map((p) => ('rule' in p ? p.rule : p.code));
    assert.deepEqual(names(check(page)), ['empty-button', 'label-for']);
    assert.deepEqual(names(check(page, { rules: () => ({}) })), names(check(page)));
    // …and a project's own hooks get the same, whichever position the set is in.
    const log: string[] = [];
    const spy: RuleSet = () => ({
      text: (content) => log.push(content),
      close: (tag) => log.push(`/${tag}`),
      end: () => log.push('end'),
    });
    check('<p>hi</p>', { rules: [() => ({}), spy] });
    assert.deepEqual(log, ['hi', '/p', 'end']);
  });
  test('every hook is optional', () => {
    assert.doesNotThrow(() => check('<p>x</p>', { a11y: false, rules: () => ({}) }));
  });
  test('an entry that is not a rule set is left out, so a condition can sit in the list', () => {
    const strict = false;
    const house = seen('house');
    for (const rules of [[strict && house], [null], [undefined, house]] as unknown as RuleSet[][]) {
      assert.doesNotThrow(() => check('<img src="a">', { rules }));
      assert.doesNotThrow(() => check('<img src="a">', { a11y: false, rules }));
    }
    assert.deepEqual(
      check('<img src="a" alt="">', { a11y: false, rules: [undefined, house] as unknown as RuleSet[] }).map((p) =>
        'rule' in p ? p.rule : p.code,
      ),
      ['house'],
    );
  });
  test('an empty list of rule sets behaves like none at all', () => {
    assert.deepEqual(check('<div>', { a11y: false, rules: [] }), [
      { code: 9, message: '`<div>` is never closed', at: 0, near: '<div>' },
    ]);
  });
});

suite('check(): options a JavaScript caller can send', () => {
  // `null` is outside the types, so it cannot be a type error, and it must not throw either. In
  // place of the options, it leaves them all out. Inside them, it reads as `false` wherever it
  // lands: the accessibility rules off, no project rules, the id checks off.
  const nul = null as unknown as undefined;
  const page = '<img src="a"><label for="x">y</label>';
  const tags = (r: ReturnType<typeof check>) => r.map((p) => ('rule' in p ? p.rule : p.code));
  test('null reads as false, and never throws', () => {
    assert.deepEqual(tags(check(page)), ['img-alt', 15]);
    assert.deepEqual(tags(check(page, nul)), ['img-alt', 15]);
    assert.deepEqual(tags(check(page, { a11y: nul })), [15]);
    assert.deepEqual(tags(check(page, { a11y: { without: nul } })), ['img-alt', 15]);
    assert.deepEqual(tags(check(page, { rules: nul })), ['img-alt', 15]);
    assert.deepEqual(tags(check(page, { ids: nul })), ['img-alt']);
  });
});

suite('check.enabled', () => {
  test('is true wherever the checks actually run', () => {
    // The production build sets it false. test/built/output.test.ts asserts that against dist/.
    assert.equal(check.enabled, true);
    assert.notDeepEqual(check('<div>'), []);
  });
});
