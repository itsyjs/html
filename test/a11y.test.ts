import { suite, test } from 'node:test';
import assert from 'node:assert/strict';
import { check } from '#check';

// Every case here came out of an adversarial review of the rule it sits under. The clean cases are
// the near-misses a sloppy implementation fires on. They are the point of the file.
const found = (markup: string) =>
  check(markup)
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
    assert.deepEqual(found('<textarea aria-label="Note"><img src=x></textarea>'), []);
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
    assert.deepEqual(found('<a tabindex="0">Menu</a>'), []);
    assert.deepEqual(found('<svg><a xlink:href="#x"><circle></circle></a></svg>'), []);
    assert.deepEqual(found('<a><img src="logo.png" alt="Home"></a>'), ['a-href']);
  });
  test('html-lang: a page with no language', () => {
    assert.deepEqual(found('<html><head><title>t</title></head><body>x</body></html>'), ['html-lang']);
    assert.deepEqual(found('<html lang="en"><head><title>t</title></head><body>x</body></html>'), []);
    assert.deepEqual(found('<html lang="en-GB" dir="rtl"><head><title>t</title></head><body>x</body></html>'), []);
    assert.deepEqual(found('<html lang=""><head><title>t</title></head><body>x</body></html>'), ['html-lang']);
    assert.deepEqual(found('<html lang=" "><head><title>t</title></head><body>x</body></html>'), ['html-lang']);
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
    // aria-hidden hides the frame from a screen reader but not from the tab order. That is a separate finding.
    assert.deepEqual(found('<iframe src="/x" aria-hidden="true"></iframe>'), ['aria-hidden-focus']);
    assert.deepEqual(found('<iframe src="/x" aria-hidden="true" tabindex="-1"></iframe>'), []);
    // Out of the tab order, nobody lands in the frame. The ACT rule leaves it alone too.
    assert.deepEqual(found('<iframe src="/x" tabindex="-1"></iframe>'), []);
    assert.deepEqual(found('<iframe src="/x" title=" "></iframe>'), ['iframe-title']);
    // A frame can be tabbed to, so the browser ignores role="none" on it.
    assert.deepEqual(found('<iframe src="/x" role="none"></iframe>'), ['iframe-title', 'role-presentation-conflict']);
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
    // A script's text is code, and a <noscript>'s text never shows. Neither names anything.
    assert.deepEqual(found('<button><script>save()</script></button>'), ['empty-button']);
    assert.deepEqual(found('<button><noscript>Save</noscript></button>'), ['empty-button']);
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
    assert.deepEqual(found('<label for="w">Email</label><div id="w"><input id="e" type="email"></div>'), [
      'field-label', // the input the label was meant for is left without a name
      'label-for',
    ]);
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
    assert.deepEqual(found('<input aria-label="Name" aria-disabled="disabled">'), ['aria-boolean']);
    assert.deepEqual(found('<div role="checkbox" aria-checked="mixed" tabindex="0" aria-label="x"></div>'), []);
    assert.deepEqual(found('<div aria-invalid="spelling"></div>'), []);
    assert.deepEqual(found('<button aria-expanded="FALSE">Menu</button>'), []);
    assert.deepEqual(found('<a href="/now" aria-current="page">Now</a>'), []);
    // Each takes the values the spec lists for it: `mixed` only on the two tristates, `undefined`
    // only where the attribute's value list includes it.
    assert.deepEqual(found('<button aria-expanded="mixed">Menu</button>'), ['aria-boolean']);
    assert.deepEqual(found('<div aria-required="undefined" role="textbox" aria-label="x"></div>'), ['aria-boolean']);
    assert.deepEqual(found('<button aria-pressed="undefined">Bold</button>'), []);
    assert.deepEqual(found('<div aria-selected="undefined" role="option">x</div>'), []);
  });
  test('aria-value: a number, a whole number or a token the attribute does not take', () => {
    assert.deepEqual(found('<div role="gridcell" aria-rowindex="2.5">x</div>'), ['aria-value']);
    assert.deepEqual(found('<div role="slider" aria-label="x" aria-valuenow="two"></div>'), ['aria-value']);
    assert.deepEqual(found('<button aria-haspopup="yes">Menu</button>'), ['aria-value']);
    assert.deepEqual(found('<div aria-live="polite" aria-relevant="additions invalid">x</div>'), ['aria-value']);
    // Numbers as ARIA writes them, and tokens in any case.
    assert.deepEqual(found('<div role="gridcell" aria-rowindex="+2" aria-colindex="-1">x</div>'), []);
    assert.deepEqual(found('<div role="slider" aria-label="x" aria-valuenow="2.5e1" aria-valuemin=".5"></div>'), []);
    assert.deepEqual(found('<button aria-haspopup="MENU">Menu</button>'), []);
    assert.deepEqual(found('<div aria-live="polite" aria-relevant="additions text">x</div>'), []);
    // The message says what the browser makes of it: aria-current reads an unknown value as true.
    assert.match(check('<a href="/" aria-current="yes">Home</a>')[0]!.message, /reads it as `true`/);
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
    // Media with controls and editable content take focus as a control does.
    assert.deepEqual(found('<video src="a.mp4" controls aria-hidden="true"></video>'), ['aria-hidden-focus']);
    assert.deepEqual(found('<video src="a.mp4" aria-hidden="true"></video>'), []);
    assert.deepEqual(found('<div contenteditable aria-hidden="true">x</div>'), ['aria-hidden-focus']);
    assert.deepEqual(found('<div contenteditable="false" aria-hidden="true">x</div>'), []);
  });
  test('aria-hidden-focus: a closed <details> or <dialog> holds nothing the keyboard reaches yet', () => {
    // Only its <summary> can be tabbed to, so that is the one stop that says nothing.
    assert.deepEqual(
      found('<div aria-hidden="true"><details><summary>More</summary><button>x</button></details></div>'),
      ['aria-hidden-focus'],
    );
    assert.deepEqual(found('<div aria-hidden="true"><dialog><button>x</button></dialog></div>'), []);
    assert.deepEqual(found('<div aria-hidden="true"><dialog open><button>x</button></dialog></div>'), [
      'aria-hidden-focus',
    ]);
    // …and whatever follows it is reachable again.
    assert.deepEqual(
      found('<details><summary>More</summary>x</details><div aria-hidden="true"><button>b</button></div>'),
      ['aria-hidden-focus'],
    );
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
  test('a `<` that opens no tag is text, as the browser reads it', () => {
    assert.deepEqual(found('<button><</button>'), []);
    assert.deepEqual(found('<h2>1 <3 2</h2>'), []);
    assert.deepEqual(found('<button>< </button>'), []);
  });
  test('an end tag with no name is not text: the browser makes it a comment, or drops it', () => {
    assert.deepEqual(found('<button></ x></button>'), ['empty-button']);
    assert.deepEqual(found('<button></></button>'), ['empty-button']);
  });
  test('a repeated attribute is judged by its first value, the one the browser keeps', () => {
    assert.deepEqual(found('<img src="a" alt="" alt="photo.png">'), []);
    assert.deepEqual(found('<img src="a" alt="photo.png" alt="">'), ['img-alt-filename']);
  });
});

suite('turning rules off', () => {
  const page = '<img src="hero.jpg"><img src="a.jpg" alt="photo-3.png"><button></button><div>';
  const names = (r: ReturnType<typeof check>) => r.map((p) => ('rule' in p ? p.rule : `code ${p.code}`));
  test('without silences the named rules and nothing else', () => {
    assert.deepEqual(names(check(page)), ['img-alt', 'img-alt-filename', 'empty-button', 'code 9']);
    assert.deepEqual(names(check(page, { a11y: { without: ['img-alt-filename'] } })), [
      'img-alt',
      'empty-button',
      'code 9',
    ]);
    assert.deepEqual(names(check(page, { a11y: { without: ['img-alt-filename', 'empty-button'] } })), [
      'img-alt',
      'code 9',
    ]);
  });
  test('naming a rule that never fires changes nothing', () => {
    assert.deepEqual(names(check(page, { a11y: { without: ['misplaced-scope'] } })), names(check(page)));
  });
  test('without cannot silence a markup problem', () => {
    assert.deepEqual(names(check(page, { a11y: { without: ['img-alt', 'img-alt-filename', 'empty-button'] } })), [
      'code 9',
    ]);
  });
  test('an empty a11y object is just a11y', () => {
    assert.deepEqual(names(check(page, { a11y: {} })), names(check(page)));
  });
});

// The role rules. As above, the clean cases are the point. These rules read a hand-written table,
// so a missing entry shows up as a finding on correct markup, not as a miss.
suite('role rules', () => {
  test('role-unknown: a role no browser knows', () => {
    assert.deepEqual(found('<div role="buton">x</div>'), ['role-unknown']);
    assert.deepEqual(found('<div role="">x</div>'), ['aria-empty']); // its own rule, not this one
    assert.deepEqual(found('<div role="button" aria-label="x">x</div>'), []);
    assert.deepEqual(found('<div role="BUTTON" aria-label="x">x</div>'), []); // roles are case-insensitive
    assert.deepEqual(found('<div role="  button  " aria-label="x">x</div>'), []);
  });
  test('role-unknown: the roles the ARIA 1.3 draft adds are roles', () => {
    assert.deepEqual(found('<div role="image" aria-label="A map">x</div>'), []);
    assert.deepEqual(found('<div role="sectionheader">x</div>'), []);
    assert.deepEqual(found('<div role="sectionfooter">x</div>'), []);
    assert.deepEqual(found('<span role="mark">x</span>'), []);
  });
  test('role-unknown: a fallback list is deliberate, and DPUB and Graphics roles are roles', () => {
    // The browser takes the first role it knows, so a list with a real role in it is fine.
    assert.deepEqual(found('<div role="switch button" aria-checked="true">x</div>'), []);
    assert.deepEqual(found('<div role="doc-abstract">x</div>'), []); // DPUB-ARIA
    assert.deepEqual(found('<div role="graphics-document">x</div>'), []); // Graphics ARIA
    // Not an ARIA role, but WebKit reads it for VoiceOver. It is not ignored, so it is not reported.
    assert.deepEqual(found('<span role="text">a<br>b</span>'), []);
    assert.deepEqual(found('<span role="nonsense text">x</span>'), []);
    // No other browser takes it, so no role is certain. A finding shows the tag alone.
    assert.match(check('<input role="text">')[0]!.message, /^`<input>` has no label/);
    assert.deepEqual(found('<div role="nonsense alsononsense">x</div>'), ['role-unknown']);
    // A typo in a role from those vocabularies is no role at all, and neither is a hyphenated ARIA one.
    assert.deepEqual(found('<div role="doc-abstrct">x</div>'), ['role-unknown']);
    assert.deepEqual(found('<div role="menu-item" tabindex="0">x</div>'), ['role-unknown']);
  });
  test('role rules: the first role the browser knows is the one it takes, whatever vocabulary it is from', () => {
    // A browser that knows DPUB-ARIA takes doc-abstract here, so the role is not ignored…
    assert.deepEqual(found('<section role="nonsense doc-abstract">x</section>'), []);
    // …and it takes doc-abstract before checkbox, so no aria-checked is owed.
    assert.deepEqual(found('<div role="doc-abstract checkbox">x</div>'), []);
    // Listed first, checkbox is the role every browser takes.
    assert.deepEqual(found('<div role="checkbox doc-abstract">x</div>'), ['role-required-props']);
  });
  test('role-redundant: the element already had that role', () => {
    assert.deepEqual(found('<nav role="navigation">x</nav>'), ['role-redundant']);
    assert.deepEqual(found('<button role="button">x</button>'), ['role-redundant']);
    assert.deepEqual(found('<h2 role="heading">x</h2>'), ['role-redundant']);
    assert.deepEqual(found('<a href="/x" role="link">y</a>'), ['role-redundant']);
    assert.deepEqual(found('<input type="checkbox" role="checkbox" aria-label="x">'), ['role-redundant']);
    // A text input with no `list` is a textbox, and a <mark> is a mark; <div> and <span> are generic.
    assert.deepEqual(found('<input type="text" role="textbox" aria-label="x">'), ['role-redundant']);
    assert.deepEqual(found('<input type="search" role="searchbox" aria-label="x">'), ['role-redundant']);
    // A type with no role of its own is no textbox, so the role is news.
    assert.deepEqual(found('<input type="password" role="textbox" aria-label="x">'), []);
    assert.deepEqual(found('<input type="date" role="textbox" aria-label="x">'), []);
    assert.deepEqual(found('<mark role="mark">x</mark>'), ['role-redundant']);
    assert.deepEqual(found('<div role="generic">x</div>'), ['role-redundant']);
    assert.deepEqual(found('<img src="a.png" alt="" role="presentation">'), ['role-redundant']);
    // Changing an element's role is the whole point of the attribute.
    assert.deepEqual(found('<ul role="tablist"><li role="tab">x</li></ul>'), []);
    assert.deepEqual(found('<a role="button" href="/x">y</a>'), []);
  });
  test('role-redundant: stays silent where the role depends on context', () => {
    // <header>, <footer>, <section> and <aside> take their role from an ancestor, so none of them
    // are in the table and none of them report.
    assert.deepEqual(found('<header role="banner">x</header>'), []);
    assert.deepEqual(found('<footer role="contentinfo">x</footer>'), []);
    assert.deepEqual(found('<section role="region" aria-label="x">y</section>'), []);
    // Inside an <article>, an unnamed <aside> is generic: the role is what makes it a landmark.
    assert.deepEqual(found('<article><h2>t</h2><aside role="complementary">x</aside></article>'), []);
    assert.deepEqual(found('<a role="link">y</a>'), []); // no href, so no implicit link to be redundant with
    // With a `list`, a text input is a combobox only if the list names a <datalist>.
    assert.deepEqual(found('<input type="text" list="c" role="textbox" aria-label="x">'), []);
    // An <option> is an option only in a <select> or a <datalist>. Anywhere else the role is news.
    assert.deepEqual(
      found('<div role="listbox" aria-label="x"><option role="option" aria-selected="false">A</option></div>'),
      [],
    );
  });
  test('role-redundant: <html> is not a document', () => {
    // Its role is generic, like a <div>'s: the document role belongs to the page, not the element.
    assert.deepEqual(found('<html lang="en" role="document"><head><title>t</title></head><body>x</body></html>'), []);
  });
  test('role-redundant: a list may restate its role', () => {
    // Safari drops the list role from a list styled `list-style: none`, and role="list" puts it
    // back. So it is not redundant in practice.
    assert.deepEqual(found('<ul role="list"><li>x</li></ul>'), []);
    assert.deepEqual(found('<ol role="list"><li>x</li></ol>'), []);
    assert.deepEqual(found('<menu role="list"><li>x</li></menu>'), []);
  });
  test('role-redundant: a table may restate its roles', () => {
    // A responsive table changes `display` on these, and Chrome and Safari have both dropped the
    // table roles when it does. Restating them is the documented fix, so none of them is redundant.
    assert.deepEqual(
      found('<table role="table"><tbody role="rowgroup"><tr role="row"><td role="cell">x</td></tr></tbody></table>'),
      [],
    );
    assert.deepEqual(
      found(
        '<table><thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">x</th></tr></thead></table>',
      ),
      [],
    );
    assert.deepEqual(found('<table><tfoot role="rowgroup"><tr><td>x</td></tr></tfoot></table>'), []);
    // The documented fix restates the caption's role along with the rest.
    assert.deepEqual(found('<table role="table"><caption role="caption">Sales</caption></table>'), []);
    // The rest of the role check still applies to them.
    assert.deepEqual(found('<table role="tabel"><tbody><tr><td>x</td></tr></tbody></table>'), ['role-unknown']);
  });
  test('role-redundant: a <select> settles its own role from multiple and size', () => {
    // Without this, role="combobox" here reports a missing aria-expanded the element provides
    // itself. The markup settles which it is, so both directions are checked.
    assert.deepEqual(found('<select aria-label="x" role="combobox"><option>a</option></select>'), ['role-redundant']);
    assert.deepEqual(found('<select multiple aria-label="x" role="listbox"><option>a</option></select>'), [
      'role-redundant',
    ]);
    assert.deepEqual(found('<select size="4" aria-label="x" role="listbox"><option>a</option></select>'), [
      'role-redundant',
    ]);
    assert.deepEqual(found('<select size="1" aria-label="x" role="listbox"><option>a</option></select>'), []);
    assert.deepEqual(found('<select aria-label="x" role="listbox"><option>a</option></select>'), []);
    // `size` reads as the browser reads it, not as Number() does: `2px` is two rows, `1e3` is one.
    assert.deepEqual(found('<select size="2px" aria-label="x" role="listbox"><option>a</option></select>'), [
      'role-redundant',
    ]);
    assert.deepEqual(
      found('<select size="2px" aria-label="x" role="combobox" aria-expanded="false"><option>a</option></select>'),
      [],
    );
    assert.deepEqual(found('<select size="1e3" aria-label="x" role="combobox"><option>a</option></select>'), [
      'role-redundant',
    ]);
    assert.deepEqual(found('<select size="1e3" aria-label="x" role="listbox"><option>a</option></select>'), []);
  });
  test('role-required-props: a role with no state to read', () => {
    assert.deepEqual(found('<div role="checkbox" aria-label="x">y</div>'), ['role-required-props']);
    assert.deepEqual(found('<div role="checkbox" aria-checked="false" aria-label="x">y</div>'), []);
    assert.deepEqual(found('<div role="slider" aria-label="x">y</div>'), ['role-required-props']);
    assert.deepEqual(found('<div role="slider" aria-valuenow="3" aria-label="x">y</div>'), []);
    assert.deepEqual(found('<div role="heading">x</div>'), ['role-required-props']);
    assert.deepEqual(found('<div role="heading" aria-level="2">x</div>'), []);
    // A heading has a level to fall back on, so its message says which, not that there is none.
    assert.match(check('<div role="heading">x</div>')[0]!.message, /as level 2/);
    assert.deepEqual(found('<div role="meter" aria-label="Disk">x</div>'), ['role-required-props']);
    assert.deepEqual(found('<div role="meter" aria-valuenow="7" aria-label="Disk">x</div>'), []);
    assert.deepEqual(found('<meter role="meter">7</meter>'), ['role-redundant']); // has a value of its own
    // ARIA asks a spinbutton for aria-valuenow only once it has a value.
    assert.deepEqual(found('<div role="spinbutton" aria-label="Quantity" tabindex="0"></div>'), []);
  });
  test('role-required-props: not where the element brings the state itself', () => {
    // Given its own role back, an element reports its own state. That is role-redundant's business.
    assert.deepEqual(found('<input type="checkbox" role="checkbox" aria-label="x">'), ['role-redundant']);
    assert.deepEqual(found('<input type="range" role="slider" aria-label="x">'), ['role-redundant']);
    // A type with spaces around it is no type the browser knows, so this is a text input. A text
    // input given the checkbox role owes its state.
    assert.deepEqual(found('<input type=" checkbox " role="checkbox" aria-label="x">'), ['role-required-props']);
    // Given another role, a checkbox or radio button still reports its checkedness, and ARIA in HTML
    // forbids aria-checked on one. This is the native switch.
    assert.deepEqual(found('<input type="checkbox" role="switch" aria-label="x">'), []);
    assert.deepEqual(found('<input type="checkbox" role="switch" checked aria-label="x">'), []);
    assert.deepEqual(found('<input type="checkbox" role="menuitemcheckbox" aria-label="x">'), []);
    assert.deepEqual(found('<input type="radio" role="menuitemradio" aria-label="x">'), []);
    assert.deepEqual(found('<input type="range" role="scrollbar" aria-label="x">'), []);
    assert.deepEqual(found('<input type="number" role="slider" aria-label="x">'), []);
    // A text input with a `list` is a combobox already, and shows its own suggestions.
    assert.deepEqual(found('<input list="c" role="combobox" aria-label="City"><datalist id="c"></datalist>'), []);
    assert.deepEqual(
      found('<input type="search" list="c" role="combobox" aria-label="City"><datalist id="c"></datalist>'),
      [],
    );
    assert.deepEqual(
      found('<input type="checkbox" list="c" role="switch" aria-label="x"><datalist id="c"></datalist>'),
      [],
    );
    // Without one, this is the ARIA 1.2 combobox, which owes its aria-expanded.
    assert.deepEqual(found('<input type="text" role="combobox" aria-label="City">'), ['role-required-props']);
    // Elements with no such state of their own still owe it.
    assert.deepEqual(found('<button role="switch">x</button>'), ['role-required-props']);
    assert.deepEqual(found('<input role="switch" aria-label="x">'), ['role-required-props']);
    assert.deepEqual(found('<div role="button" aria-label="x">y</div>'), []); // needs no state
    // A custom element can carry its state through ElementInternals, which the markup never shows.
    assert.deepEqual(found('<my-switch role="switch"></my-switch>'), []);
  });
  test('role-presentation-conflict: a presentational role the browser has to ignore', () => {
    assert.deepEqual(found('<button role="presentation">x</button>'), ['role-presentation-conflict']);
    assert.deepEqual(found('<a href="/x" role="none">y</a>'), ['role-presentation-conflict']);
    assert.deepEqual(found('<div tabindex="0" role="presentation">x</div>'), ['role-presentation-conflict']);
    // Not focusable, so the role is honoured and there is nothing to report.
    assert.deepEqual(found('<img src="c.jpg" role="presentation">'), []);
    assert.deepEqual(found('<div role="presentation">x</div>'), []);
    assert.deepEqual(found('<button disabled role="presentation">x</button>'), []);
    assert.deepEqual(found('<a role="none" id="x">y</a>'), []); // no href, so not a link and not focusable
    assert.deepEqual(found('<input type="HIDDEN" role="presentation">'), []); // the type reads case-insensitively
    // A global ARIA attribute undoes a presentational role too, as it does `alt=""`.
    assert.deepEqual(found('<nav role="presentation" aria-label="Main"><a href="/">Home</a></nav>'), [
      'role-presentation-conflict',
    ]);
    assert.deepEqual(found('<img src="a.png" alt="" aria-labelledby="l"><span id="l">Logo</span>'), [
      'role-presentation-conflict',
    ]);
    assert.deepEqual(found('<img src="a.png" alt="" aria-hidden="false">'), []); // not a global one
  });
  test('role rules stay out of hidden subtrees, like every other rule', () => {
    assert.deepEqual(found('<div hidden><div role="buton">x</div></div>'), []);
    assert.deepEqual(found('<div aria-hidden="true"><nav role="navigation">x</nav></div>'), []);
  });
});

suite('ordinary markup keeps quiet', () => {
  test('a realistic page reports nothing', () => {
    const page =
      '<!doctype html><html lang="en"><head><title>Shop</title></head><body>' +
      '<header><nav aria-label="Main"><ul><li><a href="/">Home</a></li></ul></nav></header>' +
      '<main><h1>Boots</h1><img src="boot.jpg" alt="A leather boot">' +
      '<form><label for="q">Search</label><input id="q" type="search">' +
      '<button type="submit">Go</button></form>' +
      '<div role="tablist"><button role="tab" aria-selected="true" aria-controls="p">One</button></div>' +
      '<div role="tabpanel" id="p">x</div>' +
      '</main><footer><p>&copy; 2026</p></footer></body></html>';
    assert.deepEqual(check(page), []);
  });
});
