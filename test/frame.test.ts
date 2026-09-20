import { suite, test } from 'node:test';
import assert from 'node:assert/strict';
import { html, raw } from '#index';
import { element, frame, head } from '#frame';
import { check } from '#check';

const s = (x: unknown) => String(x);
const HEAD = '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">';

suite('frame()', () => {
  test('the minimal document, with lang and title escaped', () => {
    assert.equal(
      s(frame({ lang: 'nb"', title: 'Hei <x> & y' })),
      `<!doctype html><html lang="nb&quot;"><head>${HEAD}<title>Hei &lt;x&gt; &amp; y</title></head><body><main id="maincontent" tabindex="-1"></main></body></html>`,
    );
  });
  test('body order: header, main, footer, scripts; main can be dropped or given attributes', () => {
    const doc = frame({
      lang: 'nb',
      title: 't',
      dir: 'ltr',
      header: html`<header>h</header>`,
      content: html`<p>c</p>`,
      footer: html`<footer>f</footer>`,
      scripts: raw('<script src="/a.js"></script>'),
      attrs: { html: { class: 'dark' }, body: { 'data-app': 'x' }, main: { class: 'wide', id: 'content' } },
    });
    assert.equal(
      s(doc),
      `<!doctype html><html lang="nb" dir="ltr" class="dark"><head>${HEAD}<title>t</title></head><body data-app="x"><header>h</header><main id="content" tabindex="-1" class="wide"><p>c</p></main><footer>f</footer><script src="/a.js"></script></body></html>`,
    );
    assert.equal(
      s(frame({ lang: 'nb', title: 't', main: false, content: 'a<b' })),
      `<!doctype html><html lang="nb"><head>${HEAD}<title>t</title></head><body>a&lt;b</body></html>`,
    );
    // without a <main> there is nothing for attrs.main to decorate
    assert.equal(
      s(frame({ lang: 'nb', title: 't', main: false, content: 'c', attrs: { main: { class: 'w' } } })),
      `<!doctype html><html lang="nb"><head>${HEAD}<title>t</title></head><body>c</body></html>`,
    );
  });
  test('description sits after the title, escaped, and a head entry replaces it in place', () => {
    assert.equal(
      s(frame({ lang: 'nb', title: 't', description: 'a "b" & c' })),
      `<!doctype html><html lang="nb"><head>${HEAD}<title>t</title><meta name="description" content="a &quot;b&quot; &amp; c"></head><body><main id="maincontent" tabindex="-1"></main></body></html>`,
    );
    assert.equal(
      s(
        frame({
          lang: 'nb',
          title: 't',
          description: 'first',
          head: [
            { tag: 'link', attrs: { rel: 'canonical', href: '/p' } },
            { tag: 'meta', attrs: { name: 'description', content: 'second' } },
          ],
        }),
      ),
      `<!doctype html><html lang="nb"><head>${HEAD}<title>t</title><meta name="description" content="second"><link rel="canonical" href="/p"></head><body><main id="maincontent" tabindex="-1"></main></body></html>`,
    );
  });
  test('the head is a keyed set: later wins, in the earlier position; Html passes through', () => {
    const doc = frame({
      lang: 'nb',
      title: 'first',
      head: [
        { tag: 'link', attrs: { rel: 'icon', href: '/a.svg', type: 'image/svg+xml' } },
        raw('<!-- x -->'),
        { tag: 'meta', attrs: { name: 'viewport', content: 'width=device-width' } },
        { tag: 'link', attrs: { rel: 'icon', href: '/b.svg', type: 'image/svg+xml' } },
        { tag: 'link', attrs: { rel: 'icon', href: '/c.ico', sizes: 'any' } },
        { tag: 'title', body: 'second' },
        { tag: 'link', attrs: { rel: 'stylesheet', href: '/x.css' } },
        { tag: 'link', attrs: { rel: 'stylesheet', href: '/x.css' } },
        { tag: 'meta', attrs: { name: 'description', content: 'd' } },
        { tag: 'meta', attrs: { name: 'description', content: 'e' } },
        raw('<!-- x -->'),
      ],
    });
    assert.equal(
      s(doc),
      '<!doctype html><html lang="nb"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>second</title><link rel="icon" href="/b.svg" type="image/svg+xml"><!-- x --><link rel="icon" href="/c.ico" sizes="any"><link rel="stylesheet" href="/x.css"><meta name="description" content="e"><!-- x --></head><body><main id="maincontent" tabindex="-1"></main></body></html>',
    );
  });
  test('a nonce lands on script and style entries that lack one, never on rendered Html', () => {
    const doc = frame({
      lang: 'nb',
      title: 't',
      nonce: 'n1',
      head: [
        { tag: 'style', body: raw('a{}') },
        { tag: 'script', attrs: { src: '/a.js', nonce: 'own' } },
      ],
      scripts: [
        { tag: 'script', attrs: { type: 'application/json', id: 'd' }, body: raw('{"a":1}') },
        raw('<script>x()</script>'),
      ],
    });
    assert.match(s(doc), /<style nonce="n1">a\{\}<\/style><script src="\/a\.js" nonce="own"><\/script><\/head>/);
    assert.match(
      s(doc),
      /<script type="application\/json" id="d" nonce="n1">\{"a":1\}<\/script><script>x\(\)<\/script><\/body>/,
    );
  });
  test('head and scripts accept a single rendered Html as well as a list', () => {
    const doc = frame({
      lang: 'nb',
      title: 't',
      head: raw('<link rel="x" href="/y">'),
      scripts: html`<script>${raw('1')}</script>`,
    });
    assert.match(
      s(doc),
      /<title>t<\/title><link rel="x" href="\/y"><\/head><body><main[^>]*><\/main><script>1<\/script><\/body>/,
    );
  });
  test('the output passes check()', () => {
    const doc = frame({
      lang: 'nb',
      title: 't',
      head: [{ tag: 'link', attrs: { rel: 'icon', href: '/a.svg' } }],
      header: html`<header><a href="#maincontent">skip</a></header>`,
      content: html`<h1>x</h1>`,
    });
    assert.deepEqual(check(doc), []);
  });
});

suite('element() and head()', () => {
  test('void elements have no end tag; bodies are escaped unless Html; attributes go through attrs()', () => {
    assert.equal(
      s(element({ tag: 'link', attrs: { rel: 'icon', href: 'javascript:x', hidden: false } })),
      '<link rel="icon" href="about:blank#blocked">',
    );
    assert.equal(s(element({ tag: 'noscript', body: '<b>' })), '<noscript>&lt;b&gt;</noscript>');
    assert.equal(s(element({ tag: 'noscript', body: html`<b>${'x'}</b>` })), '<noscript><b>x</b></noscript>');
    assert.equal(s(element({ tag: 'Meta', attrs: { charset: 'utf-8' } })), '<meta charset="utf-8">');
  });
  test('script and style bodies must be raw(); bad tag names throw', () => {
    assert.throws(() => element({ tag: 'script', body: 'x()' }), { code: 6 });
    assert.throws(() => element({ tag: 'style', body: 'a{}' }), { code: 6 });
    assert.equal(s(element({ tag: 'script', body: raw('x()') })), '<script>x()</script>');
    assert.throws(() => element({ tag: 'scr ipt' }), { code: 17 });
    assert.throws(() => element({ tag: '' }), { code: 17 });
  });
  test('a function body is called; a void element takes no body at all', () => {
    assert.equal(s(element({ tag: 'script', body: () => raw('1') })), '<script>1</script>');
    assert.equal(s(element({ tag: 'noscript', body: () => () => 'a<b' })), '<noscript>a&lt;b</noscript>');
    assert.equal(s(element({ tag: 'link', attrs: { rel: 'x' }, body: null })), '<link rel="x">');
    assert.equal(s(element({ tag: 'link', body: false })), '<link>');
    assert.throws(() => element({ tag: 'br', body: 'x' }), { name: 'HtmlError', code: 18 });
    assert.throws(() => element({ tag: 'meta', body: () => raw('') }), { code: 18 });
  });
  test('head() merges without the skeleton; a custom key overrides the derived one', () => {
    assert.equal(
      s(
        head(
          [
            { tag: 'link', attrs: { rel: 'icon', href: '/a.svg', type: 'image/svg+xml' } },
            { tag: 'link', attrs: { rel: 'icon', href: '/b.svg', type: 'image/svg+xml' } },
            { tag: 'meta', attrs: { name: 'a' }, key: 'k' },
            { tag: 'meta', attrs: { name: 'b' }, key: 'k' },
          ],
          { nonce: 'n' },
        ),
      ),
      '<link rel="icon" href="/b.svg" type="image/svg+xml"><meta name="b">',
    );
    assert.equal(s(head({ tag: 'style', body: raw('a{}') }, { nonce: 'n' })), '<style nonce="n">a{}</style>');
  });
});
