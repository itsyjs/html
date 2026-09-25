import { suite, test } from 'node:test';
import assert from 'node:assert/strict';
import { attrs, html } from '#index';
import { check } from '#check';

const s = (x: unknown) => String(x);
const chr = String.fromCharCode;
// A small seeded generator, so a failure is reproducible: the failing input is in the assertion message.
const rng = (seed: number) => (): number => {
  seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
  return seed / 4294967296;
};
const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;

suite('fuzz: the URL guard', () => {
  const schemes = ['javascript:', 'vbscript:', 'JavaScript:', 'VBScript:', 'file:'];
  // Decorate a scheme with what browsers ignore while reading one, in random case.
  const decorate = (r: () => number, noise: readonly string[]): string => {
    let url = '';
    for (const c of pick(r, schemes)) url += pick(r, noise) + (r() < 0.5 ? c.toUpperCase() : c.toLowerCase());
    return url + pick(r, noise) + 'alert(1)';
  };
  test('a dangerous scheme is blocked however it is spelled', () => {
    const r = rng(1);
    const noise = ['', ' ', chr(9), chr(10), chr(13), chr(12), chr(11), chr(0), chr(1), chr(31)];
    for (let n = 0; n < 2000; n++) {
      const url = decorate(r, noise);
      assert.equal(s(html`<a href="${url}">x</a>`), '<a href="about:blank#blocked">x</a>', JSON.stringify(url));
      assert.equal(s(attrs({ src: url })), 'src="about:blank#blocked"', JSON.stringify(url));
    }
  });
});

suite('fuzz: text and attribute values', () => {
  test('never break the markup around them', () => {
    const r = rng(3);
    const bits = [
      '<',
      '>',
      '&',
      '"',
      "'",
      '/',
      '=',
      'a',
      ' ',
      chr(10),
      '${',
      '…}',
      '<!--',
      '-->',
      '</p>',
      '<script>',
      chr(92),
    ];
    for (let n = 0; n < 2000; n++) {
      let v = '';
      for (let k = Math.floor(r() * 8); k > 0; k--) v += pick(r, bits);
      const out = s(html`<p title="${v}">${v}</p>`);
      assert.deepEqual(check(out), [], JSON.stringify(v));
      assert.equal((out.match(/</g) ?? []).length, 2, JSON.stringify(v)); // only the two in the template
      assert.equal((out.match(/"/g) ?? []).length, 2, JSON.stringify(v)); // only the two around title
    }
  });
});
