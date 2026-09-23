import { suite, test } from 'node:test';
import assert from 'node:assert/strict';
import { html, isHtml, raw } from '#index';
import { choose, comment, join, map, range, when, wrap } from '#util';

// Every helper is checked the way a user meets it: dropped into a template and rendered.
const s = (x: unknown) => String(x);

suite('join', () => {
  test('puts the joiner between items and renders nothing itself', () => {
    assert.deepEqual(join([1, 2, 3], ', '), [1, ', ', 2, ', ', 3]);
    assert.equal(s(html`<p>${join([1, 2, 3], ', ')}</p>`), '<p>1, 2, 3</p>');
    assert.equal(s(html`<p>${join(new Set(['a', 'b']), ' ')}</p>`), '<p>a b</p>');
  });
  test('the joiner is escaped like any value; Html passes through', () => {
    assert.equal(s(html`<p>${join(['a', 'b'], ' & ')}</p>`), '<p>a &amp; b</p>');
    assert.equal(s(html`<p>${join([html`<i>1</i>`, html`<i>2</i>`], raw('<br>'))}</p>`), '<p><i>1</i><br><i>2</i></p>');
  });
  test('nothing in, nothing out', () => {
    assert.deepEqual(join([], ','), []);
    assert.deepEqual(join(undefined, ','), []);
    assert.deepEqual(join(['a'], ','), ['a']);
  });
});

suite('map', () => {
  test('maps any iterable with an index', () => {
    function* gen() {
      yield 'a';
      yield 'b';
    }
    assert.equal(
      s(html`<ul>${map(gen(), (x, i) => html`<li>${i}:${x}</li>`)}</ul>`),
      '<ul><li>0:a</li><li>1:b</li></ul>',
    );
    assert.equal(s(html`<p>${map(new Map([['k', 'v']]).values(), (v) => v)}</p>`), '<p>v</p>');
  });
  test('undefined is an empty list', () => {
    assert.deepEqual(
      map(undefined as string[] | undefined, (x) => x),
      [],
    );
  });
});

suite('range', () => {
  test('one argument counts from zero', () => {
    assert.deepEqual(range(3), [0, 1, 2]);
    assert.deepEqual(range(0), []);
  });
  test('start, end and step', () => {
    assert.deepEqual(range(1, 4), [1, 2, 3]);
    assert.deepEqual(range(0, 10, 5), [0, 5]);
    assert.deepEqual(range(3, 0, -1), [3, 2, 1]);
    assert.deepEqual(range(4, 1), []);
  });
  test('renders through map', () => {
    assert.equal(s(html`<p>${map(range(3), (i) => html`<b>${i}</b>`)}</p>`), '<p><b>0</b><b>1</b><b>2</b></p>');
  });
});

suite('when', () => {
  test('builds only the chosen branch', () => {
    const calls: string[] = [];
    const yes = () => (calls.push('yes'), html`<b>yes</b>`);
    const no = () => (calls.push('no'), html`<b>no</b>`);
    assert.equal(s(html`${when(true, yes, no)}`), '<b>yes</b>');
    assert.equal(s(html`${when(0, yes, no)}`), '<b>no</b>');
    assert.deepEqual(calls, ['yes', 'no']);
  });
  test('false with no else renders nothing', () => {
    assert.equal(
      when(false, () => 'x'),
      undefined,
    );
    assert.equal(s(html`<p>${when(null, () => 'x')}</p>`), '<p></p>');
  });
});

suite('choose', () => {
  const cases = [
    ['ok', () => 'fine'],
    ['err', () => 'bad'],
  ] as const;
  test('the first matching case, by ===', () => {
    assert.equal(choose('ok', cases), 'fine');
    assert.equal(choose('err', cases), 'bad');
    assert.equal(s(html`<p>${choose('ok', cases)}</p>`), '<p>fine</p>');
  });
  test('the fallback, or nothing', () => {
    assert.equal(
      choose('other', cases, () => 'dunno'),
      'dunno',
    );
    assert.equal(choose('other', cases), undefined);
  });
  test('only the chosen thunk runs', () => {
    let ran = 0;
    choose(1, [
      [1, () => ++ran],
      [1, () => ++ran],
    ]);
    assert.equal(ran, 1);
  });
});

suite('wrap', () => {
  test('each item in the tag; text escaped, Html not', () => {
    assert.equal(s(html`<ul>${wrap(['a<', html`<i>b</i>`], 'li')}</ul>`), '<ul><li>a&lt;</li><li><i>b</i></li></ul>');
    assert.equal(s(html`<ul>${wrap([], 'li')}</ul>`), '<ul></ul>');
  });
  test('attributes go through attrs(), URL guard included', () => {
    assert.equal(
      s(html`<p>${wrap(['x'], 'a', { class: ['k', null], href: 'javascript:x', hidden: true })}</p>`),
      '<p><a class="k" href="about:blank#blocked" hidden>x</a></p>',
    );
  });
  test('a bad tag name is code 17', () => {
    assert.throws(() => wrap(['x'], 'x y'), { name: 'HtmlError', code: 17 });
    assert.throws(() => wrap(['x'], ''), { code: 17 });
    assert.throws(() => wrap(['x'], '1a'), { code: 17 });
  });
  test('inside <script> and <style> an item must be Html, as in a template: its text is code', () => {
    // Escaping stops `</script>`, but not `alert(1)`, which needs no escaping to run.
    assert.throws(() => wrap(['alert(1)'], 'script'), { name: 'HtmlError', code: 6 });
    assert.throws(() => wrap(['*{}'], 'STYLE'), { code: 6 });
    assert.throws(() => wrap([() => raw('x')], 'script'), { code: 6 }); // the item itself, not a thunk
    assert.equal(
      s(html`${wrap([raw('{"a":1}'), raw('{"b":2}')], 'script', { type: 'application/json' })}`),
      '<script type="application/json">{"a":1}</script><script type="application/json">{"b":2}</script>',
    );
    assert.equal(s(html`${wrap(['a'], 'scripts')}`), '<scripts>a</scripts>'); // only the whole name
  });
});

suite('comment', () => {
  test('is Html inside a comment', () => {
    const c = comment('note');
    assert.ok(isHtml(c));
    assert.equal(s(html`<p>${c}</p>`), '<p><!-- note --></p>');
  });
  test('cannot be closed early', () => {
    assert.equal(s(comment('a -- b')), '<!-- a - - b -->');
    assert.equal(s(comment('a --> b')), '<!-- a - -> b -->');
    assert.equal(s(comment('--!>')), '<!-- - -!> -->');
    assert.equal(s(comment('---')), '<!-- - - - -->');
    assert.equal(s(comment('>')), '<!-- > -->');
    assert.equal(s(comment('->')), '<!-- -> -->');
    assert.equal(s(comment('')), '<!--  -->');
  });
});
