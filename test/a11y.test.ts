import { suite, test } from 'node:test';
import assert from 'node:assert/strict';
import { check } from '#check';
import { a11y, without } from '#a11y';

// Every case here came out of an adversarial review of the rule it sits under: the clean ones are
// the near-misses that a sloppy implementation fires on, and they are the point of the file.
const found = (markup: string) =>
  check(markup, { a11y })
    .flatMap((p) => ('rule' in p ? [p.rule] : []))
    .sort();

suite('a11y rules', () => {
  test('img-alt: an image with nothing to read out', () => {
    assert.deepEqual(found('<img src="cat.jpg">'), ['img-alt']);
    assert.deepEqual(found('<img src="cat.jpg" alt="">'), []);
    assert.deepEqual(found('<img src="c.jpg" alt>'), []);
    assert.deepEqual(found('<img src="c.jpg" aria-label="Sales, 2024">'), []);
    assert.deepEqual(found('<img src="c.jpg" role="presentation">'), []);
    assert.deepEqual(found('<img src="c.jpg" aria-hidden="true">'), []);
    assert.deepEqual(found('<img src="c.jpg" aria-hidden="false">'), ['img-alt']);
    assert.deepEqual(found('<div aria-hidden="true"><img src="x.png"></div><img src="y.png">'), ['img-alt']);
    assert.deepEqual(found('<figure><img src="a.png"><figcaption>A cat</figcaption></figure>'), ['img-alt']);
    assert.deepEqual(found('<textarea><img src=x></textarea>'), []);
  });
  test('img-alt-filename: alt text that is the file name', () => {
    assert.deepEqual(found('<img src="hero-1.jpg" alt="hero-1.jpg">'), ['img-alt-filename']);
    assert.deepEqual(found('<img src="a.png" alt="IMG_20240113.PNG">'), ['img-alt-filename']);
    assert.deepEqual(found('<img src="/i/home.svg" alt="home.svg">'), ['img-alt-filename']);
    assert.deepEqual(found('<img src="a.jpg" alt="Our team photo.png">'), []);
    assert.deepEqual(found('<img src="a.jpg" alt="config.yaml">'), []);
    assert.deepEqual(found('<img src="a.jpg" alt="Read config.json first">'), []);
    assert.deepEqual(found('<img src="a.jpg" alt="">'), []);
  });
  test('a-href: an <a> that is not a link', () => {
    assert.deepEqual(found('<a>text</a>'), ['a-href']);
    assert.deepEqual(found('<a href="/x">text</a>'), []);
    assert.deepEqual(found('<a href>text</a>'), []);
    assert.deepEqual(found('<a id="top"></a>'), []);
    assert.deepEqual(found('<a name="top"></a>'), []);
    assert.deepEqual(found('<a role="button" tabindex="0">Menu</a>'), []);
    assert.deepEqual(found('<a aria-disabled="true">Next</a>'), []);
    assert.deepEqual(found('<svg><a xlink:href="#x"><circle></circle></a></svg>'), []);
    assert.deepEqual(found('<a><img src="logo.png" alt="Home"></a>'), ['a-href']);
  });
  test('html-lang: a page with no language', () => {
    assert.deepEqual(found('<html><body>x</body></html>'), ['html-lang']);
    assert.deepEqual(found('<html lang="en"><body>x</body></html>'), []);
    assert.deepEqual(found('<html lang="en-GB" dir="rtl"><body>x</body></html>'), []);
    assert.deepEqual(found('<html lang=""><body>x</body></html>'), ['html-lang']);
    assert.deepEqual(found('<section><h1>Fragment</h1></section>'), []);
    assert.deepEqual(found('<div lang="">x</div>'), []);
  });
  test('iframe-title: a frame with no name', () => {
    assert.deepEqual(found('<iframe src="/x"></iframe>'), ['iframe-title']);
    assert.deepEqual(found('<iframe title="Map of the office" src="/m"></iframe>'), []);
    assert.deepEqual(found('<iframe src="/x" aria-label="Video player"></iframe>'), []);
    assert.deepEqual(
      found('<iframe src="/gtm" height="0" width="0" style="display:none;visibility:hidden"></iframe>'),
      [],
    );
    assert.deepEqual(found('<iframe src="/x" title=""></iframe>'), ['iframe-title']);
    assert.deepEqual(found('<iframe src="/x" aria-hidden="true"></iframe>'), []);
  });
  test('empty-heading: a heading that announces nothing', () => {
    assert.deepEqual(found('<h1></h1>'), ['empty-heading']);
    assert.deepEqual(found('<h2>   </h2>'), ['empty-heading']);
    assert.deepEqual(found('<h2><span></span></h2>'), ['empty-heading']);
    assert.deepEqual(found('<h1><br></h1>'), ['empty-heading']);
    assert.deepEqual(found('<h1><!-- todo --></h1>'), ['empty-heading']);
    assert.deepEqual(found('<h1><span>Title</span></h1>'), []);
    assert.deepEqual(found('<h1><img src="logo.svg" alt="Acme"></h1>'), []);
    assert.deepEqual(found('<h1><a href="/"><img src="logo.svg" alt="Acme"></a></h1>'), []);
    assert.deepEqual(found('<h1 contenteditable></h1>'), []);
    assert.deepEqual(found('<template><h1></h1></template>'), []);
    assert.deepEqual(found('<h1>'), []);
  });
  test('empty-link: a link with no text', () => {
    assert.deepEqual(found('<a href="/about"></a>'), ['empty-link']);
    assert.deepEqual(found('<a href="/about"><span class="icon-home"></span></a>'), ['empty-link']);
    assert.deepEqual(found('<a href="/x"><img src="logo.svg" alt=""></a>'), ['empty-link']);
    assert.deepEqual(found('<a href="/"><img src="logo.svg" alt="Acme"></a>'), []);
    assert.deepEqual(found('<a href="/x" title="Home"></a>'), []);
    assert.deepEqual(found('<a href="/x" aria-labelledby="lbl"></a><span id="lbl">Home</span>'), []);
    assert.deepEqual(found('<a href="/x"><b>Read</b> more</a>'), []);
    assert.deepEqual(
      found('<a href="/x"><span aria-hidden="true">&#10005;</span><span class="sr-only">Close</span></a>'),
      [],
    );
  });
  test('empty-button: a button with no text', () => {
    assert.deepEqual(found('<button></button>'), ['empty-button']);
    assert.deepEqual(found('<button><svg viewBox="0 0 1 1"><path d="M0 0"></path></svg></button>'), ['empty-button']);
    assert.deepEqual(found('<button aria-label=""></button>'), ['aria-empty', 'empty-button']);
    assert.deepEqual(found('<button aria-label="  "></button>'), ['aria-empty', 'empty-button']);
    assert.deepEqual(found('<button><span class="label">Save</span></button>'), []);
    assert.deepEqual(found('<button><svg><title>Close</title><path d="M0 0"></path></svg></button>'), []);
    assert.deepEqual(
      found('<button aria-label="Close"><svg viewBox="0 0 1 1"><path d="M0 0"></path></svg></button>'),
      [],
    );
    assert.deepEqual(
      found('<button><svg aria-label="Close" viewBox="0 0 1 1"><path d="M0 0"></path></svg></button>'),
      [],
    );
    assert.deepEqual(found('<button><img src="i.svg" alt="Delete"></button>'), []);
    assert.deepEqual(found('<button><img src="i.svg" title="Delete"></button>'), []);
    assert.deepEqual(found('<img aria-hidden="true" src="i.svg"><button></button>'), ['empty-button']);
    assert.deepEqual(found('<button type="button"><svg aria-hidden="true"><path d="M0 0"></path></svg></button>'), [
      'empty-button',
    ]);
    assert.deepEqual(found('<button type="button"></button>'), ['empty-button']);
    assert.deepEqual(found('<button type="button"><img src="/close.svg" alt="Close"></button>'), []);
    assert.deepEqual(
      found('<button type="button"><span class="sr-only">Close</span><span aria-hidden="true">x</span></button>'),
      [],
    );
    assert.deepEqual(found('<button type="button"><svg><title>Close</title></svg></button>'), []);
    assert.deepEqual(found('<button type="button"><my-icon name="close"></my-icon></button>'), []);
    assert.deepEqual(found('<button type="button" aria-label="Close"><svg aria-hidden="true"></svg></button>'), []);
    assert.deepEqual(found('<button type="button" aria-hidden="true" tabindex="-1"></button>'), []);
    assert.deepEqual(found('<button type="button" title="Close"></button>'), []);
    assert.deepEqual(found('<button type="button"><span></span>Save</button>'), []);
  });
  test('empty-title: an empty <title>', () => {
    assert.deepEqual(found('<title></title>'), ['empty-title']);
    assert.deepEqual(found('<title>   </title>'), ['empty-title']);
    assert.deepEqual(found('<title>Home — Acme</title>'), []);
    assert.deepEqual(found('<svg><title></title></svg>'), []);
    assert.deepEqual(found('<svg><title>Icon</title><a href="/x"><text>Go</text></a></svg>'), []);
  });
  test('label-control: a label that labels nothing', () => {
    assert.deepEqual(found('<label>Email</label>'), ['label-control']);
    assert.deepEqual(found('<label for="">Email</label>'), ['label-control']);
    assert.deepEqual(found('<label>Email <span><input id="e" type="email"></span></label>'), []);
    assert.deepEqual(
      found(
        '<label id="grp">Colour</label><div role="group" aria-labelledby="grp"><input id="r1" type="radio" name="c" aria-label="Red"></div>',
      ),
      [],
    );
    assert.deepEqual(found('<label>Email <my-input></my-input></label>'), []);
    assert.deepEqual(found('<label>Count <output name="o">0</output></label>'), []);
    assert.deepEqual(found('<label><input type="checkbox" name="a"> Remember me</label>'), []);
    assert.deepEqual(found('<label for="e">Email</label><input id="e" type="email">'), []);
  });
  test('label-for: a for= pointing at something that is not a control', () => {
    assert.deepEqual(found('<label for="w">Email</label><div id="w"><input id="e" type="email"></div>'), ['label-for']);
    assert.deepEqual(
      found(
        '<label for="f">Colour</label><fieldset id="f"><input id="r" type="radio" name="c" aria-label="Red"></fieldset>',
      ),
      ['label-for'],
    );
    assert.deepEqual(found('<label for="e">Email</label>'), []);
    assert.deepEqual(found('<label for="e">Email</label><my-input id="e"></my-input>'), []);
    assert.deepEqual(found('<output for="a" id="o">3</output><span id="a">3</span>'), []);
    assert.deepEqual(found('<label for="s">Colour</label><select id="s" name="c"><option>Red</option></select>'), []);
    assert.deepEqual(found('<label for="a">A</label><div id="a"></div><input id="a" type="text">'), []);
  });
  test('aria-unknown: an aria-* name no browser reads', () => {
    assert.deepEqual(found('<div aria-labeledby="t"></div>'), ['aria-unknown']);
    assert.deepEqual(found('<div aria-role="button"></div>'), ['aria-unknown']);
    assert.deepEqual(found('<td aria-colindextext="Q1">7</td>'), []);
    assert.deepEqual(found('<div data-aria-hidden="true"></div>'), []);
    assert.deepEqual(found('<span id="n">Name</span><div aria-LabelledBy="n"></div>'), []);
  });
  test('aria-empty: an aria-* or role with an empty value', () => {
    assert.deepEqual(found('<button aria-expanded="">Menu</button>'), ['aria-empty']);
    assert.deepEqual(found('<div aria-hidden>x</div>'), ['aria-empty']);
    assert.deepEqual(found('<div role=""></div>'), ['aria-empty']);
    assert.deepEqual(found('<img src="/s.png" alt="">'), []);
    assert.deepEqual(found('<button aria-expanded="false">Menu</button>'), []);
    assert.deepEqual(found('<div class="" aria-label="Cart"></div>'), []);
  });
  test('aria-boolean: a true/false attribute given something else', () => {
    assert.deepEqual(found('<button aria-pressed="yes">Bold</button>'), ['aria-boolean']);
    assert.deepEqual(found('<input aria-disabled="disabled">'), ['aria-boolean']);
    assert.deepEqual(found('<div role="checkbox" aria-checked="mixed" tabindex="0"></div>'), []);
    assert.deepEqual(found('<div aria-invalid="spelling"></div>'), []);
    assert.deepEqual(found('<button aria-expanded="FALSE">Menu</button>'), []);
    assert.deepEqual(found('<a href="/now" aria-current="page">Now</a>'), []);
  });
  test('aria-live: a live region that is never announced', () => {
    assert.deepEqual(found('<div aria-live="true">Saved</div>'), ['aria-live']);
    assert.deepEqual(found('<div aria-live="on">Saved</div>'), ['aria-live']);
    assert.deepEqual(found('<div aria-live="polite">Saved</div>'), []);
    assert.deepEqual(found('<div aria-live="off"></div>'), []);
    assert.deepEqual(found('<div aria-live=""></div>'), ['aria-empty']);
  });
  test('aria-hidden-focus: focus landing on something hidden from screen readers', () => {
    assert.deepEqual(found('<button aria-hidden="true"><svg viewBox="0 0 1 1"></svg></button>'), ['aria-hidden-focus']);
    assert.deepEqual(found('<a href="/skip" aria-hidden="true">Skip to content</a>'), ['aria-hidden-focus']);
    assert.deepEqual(found('<div tabindex="0" aria-hidden="true">Card</div>'), ['aria-hidden-focus']);
    assert.deepEqual(found('<button><svg aria-hidden="true" viewBox="0 0 1 1"></svg> Save</button>'), []);
    assert.deepEqual(found('<button aria-hidden="true" disabled>Save</button>'), []);
    assert.deepEqual(found('<a aria-hidden="true">Label</a>'), []);
    assert.deepEqual(found('<div aria-hidden="true" tabindex="-1">Card</div>'), []);
    assert.deepEqual(found('<span hidden aria-hidden="true"><a href="/x">x</a></span>'), []);
    assert.deepEqual(found('<div aria-hidden="true" tabindex="0">x</div>'), ['aria-hidden-focus']);
    assert.deepEqual(found('<button aria-hidden="true">x</button>'), ['aria-hidden-focus']);
    assert.deepEqual(found('<a href="/x" aria-hidden="true">x</a>'), ['aria-hidden-focus']);
    assert.deepEqual(found('<details><summary aria-hidden="true">x</summary>y</details>'), ['aria-hidden-focus']);
    assert.deepEqual(found('<button aria-hidden="true" tabindex="-1">x</button>'), []);
    assert.deepEqual(found('<span aria-hidden="true">&times;</span>'), []);
    assert.deepEqual(found('<div inert><button aria-hidden="true">x</button></div>'), []);
    assert.deepEqual(found('<button aria-hidden="true" disabled>x</button>'), []);
    assert.deepEqual(found('<input type="hidden" aria-hidden="true">'), []);
    assert.deepEqual(found('<div aria-hidden tabindex="0">x</div>'), ['aria-empty']);
    assert.deepEqual(found('<div inert><ul><li>a</li></ul></div><button aria-hidden="true">b</button>'), [
      'aria-hidden-focus',
    ]);
    assert.deepEqual(found('<img hidden src="/a.png" alt=""><button aria-hidden="true">x</button>'), [
      'aria-hidden-focus',
    ]);
  });
  test('positive-tabindex: a tab order that no longer follows the page', () => {
    assert.deepEqual(found('<div tabindex="3">x</div>'), ['positive-tabindex']);
    assert.deepEqual(found('<a href="/x" tabindex="1">x</a>'), ['positive-tabindex']);
    assert.deepEqual(found('<div tabindex=" +007 ">x</div>'), ['positive-tabindex']);
    assert.deepEqual(found('<main id="maincontent" tabindex="-1">x</main>'), []);
    assert.deepEqual(found('<div tabindex="0">x</div>'), []);
    assert.deepEqual(found('<div tabindex="0x2">x</div>'), []);
    assert.deepEqual(found('<div data-tabindex="3">x</div>'), []);
    assert.deepEqual(found('<div tabindex="">x</div>'), []);
  });
  test('figcaption-parent: a caption that captions nothing', () => {
    assert.deepEqual(
      found('<figure><img src="a.jpg" alt="A cat asleep"><figcaption>Fig 1. A cat</figcaption></figure>'),
      [],
    );
    assert.deepEqual(
      found('<figure><figcaption>Fig 1. A cat</figcaption><img src="a.jpg" alt="A cat asleep"></figure>'),
      [],
    );
    assert.deepEqual(found('<figcaption>Fig 1. A cat</figcaption>'), []);
    assert.deepEqual(found('<my-figure><figcaption>Fig 1</figcaption></my-figure>'), []);
    assert.deepEqual(found('<template><figcaption>Fig 1</figcaption></template>'), []);
    assert.deepEqual(found('<figure><p>Lead-in<figcaption>Fig 1</figcaption></figure>'), []);
    assert.deepEqual(
      found('<figure><div class="frame"><img src="a.jpg" alt="A cat"><figcaption>Fig 1</figcaption></div></figure>'),
      ['figcaption-parent'],
    );
    assert.deepEqual(found('<div><figcaption>Fig 1</figcaption></div>'), ['figcaption-parent']);
  });
  test('misplaced-scope: scope outside a <th>', () => {
    assert.deepEqual(found('<table><tbody><tr><td scope="row">Mon</td><td>1</td></tr></tbody></table>'), [
      'misplaced-scope',
    ]);
    assert.deepEqual(found('<div scope="row">Mon</div>'), ['misplaced-scope']);
    assert.deepEqual(found('<table><tbody><tr><th scope="row">Mon</th><td>1</td></tr></tbody></table>'), []);
    assert.deepEqual(found('<table><tbody><tr><th>Mon</th><td>1</td></tr></tbody></table>'), []);
    assert.deepEqual(found('<my-grid scope="row"></my-grid>'), []);
    assert.deepEqual(
      found('<table><thead><tr><th scope="col">Day</th></tr></thead><tbody><tr><td>Mon</td></tr></tbody></table>'),
      [],
    );
  });
});

// Each of these is a defect an adversarial review found in the first cut of the rules.
suite('a11y rules: regressions', () => {
  test('a watched element wrapping self-closing foreign content still reports', () => {
    assert.deepEqual(found('<button><svg><a href="/x"/></svg></button>'), ['empty-button', 'empty-link']);
    assert.deepEqual(found('<h1><svg><a href="/x"/></svg></h1>'), ['empty-heading', 'empty-link']);
  });
  test('alt text that merely ends in a number is not a file name', () => {
    assert.deepEqual(found('<img src="a.jpg" alt="Screenshot 2024">'), []);
    assert.deepEqual(found('<img src="a.jpg" alt="Team photo 2024">'), []);
    assert.deepEqual(found('<img src="a.jpg" alt="photo-3.png">'), ['img-alt-filename']);
    assert.deepEqual(found('<img src="a.jpg" alt="IMG_1024.JPG">'), ['img-alt-filename']);
  });
  test('a Turkish dotted capital I does not blind the rules after it', () => {
    assert.deepEqual(found('<p>\u0130stanbul</p><div aria-labeledby="t"></div>'), ['aria-unknown']);
    assert.deepEqual(found('<button aria-label="\u0130ptal" aria-pressed="yes">x</button>'), ['aria-boolean']);
    assert.deepEqual(found('<nav aria-label="\u0130stanbul"><a href="/">Ev</a></nav>'), []);
  });
});

suite('turning rules off', () => {
  const page = '<img src="hero.jpg"><img src="a.jpg" alt="photo-3.png"><button></button><div>';
  const names = (r: ReturnType<typeof check>) => r.map((p) => ('rule' in p ? p.rule : `code ${p.code}`));
  test('without() silences the named rules and nothing else', () => {
    assert.deepEqual(names(check(page, { a11y })), ['img-alt', 'img-alt-filename', 'empty-button', 'code 9']);
    assert.deepEqual(names(check(page, { a11y: without('img-alt-filename') })), ['img-alt', 'empty-button', 'code 9']);
    assert.deepEqual(names(check(page, { a11y: without('img-alt-filename', 'empty-button') })), ['img-alt', 'code 9']);
  });
  test('naming a rule that never fires changes nothing', () => {
    assert.deepEqual(names(check(page, { a11y: without('misplaced-scope') })), names(check(page, { a11y })));
  });
  test('without() cannot silence a markup problem', () => {
    assert.deepEqual(names(check(page, { a11y: without('img-alt', 'img-alt-filename', 'empty-button') })), ['code 9']);
  });
  test('without() with no arguments is just a11y', () => {
    assert.deepEqual(names(check(page, { a11y: without() })), names(check(page, { a11y })));
  });
});
