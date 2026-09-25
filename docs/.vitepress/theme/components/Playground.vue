<script setup lang="ts">
import { computed, ref, watch, watchPostEffect } from 'vue';
import { withBase } from 'vitepress';
import { HtmlError, attrs, cx, html, isHtml, raw } from '#index';
import { choose, comment, join, map, range, when, wrap } from '#util';
import { check, type Finding, type Problem } from '#check';

const PRESETS = [
  {
    name: 'Escaping',
    code:
      "const user = { name: 'Jimothy <b>', bio: '<Hello world>!' };\n\n" +
      'return html`<article>\n' +
      '  <h3>${user.name}</h3>\n' +
      '  <p>${user.bio}</p>\n' +
      '</article>`;',
  },
  {
    name: 'Attributes',
    code:
      'const saved = false;\n\n' +
      'return html`<button type="button" ${attrs({\n' +
      "  class: ['btn', saved && 'is-saved'],\n" +
      "  'aria-pressed': saved,\n" +
      "  'data-saved': saved,\n" +
      '  disabled: false,\n' +
      '})}>Save</button>`;',
  },
  {
    name: 'Blocked URL',
    code:
      "const links = ['/docs', 'https://example.com', 'javascript:alert(1)', '  JaVa\\tScRiPt:alert(1)'];\n\n" +
      'return html`<ul>${links.map((href) => html`<li><a href="${href}">${href}</a></li>`)}</ul>`;',
  },
  {
    name: 'Unclosed tag',
    code: '// The markup check throws code 9: the <div> is never closed.\n\nreturn html`<div><p>x</p>`;',
  },
  {
    name: 'Duplicate id',
    code:
      '// check() finds what one template cannot: a duplicate id (16)\n' +
      '// and a label pointing at nothing (15).\n\n' +
      'return html`<form>\n' +
      '  <label for="name">Name</label>\n' +
      '  <input id="email">\n' +
      '  <input id="email">\n' +
      '</form>`;',
  },
];

const source = ref(PRESETS[0]!.code);
const live = ref(PRESETS[0]!.code);

// A tab is lit only while the editor holds its preset word for word. The first
// edit turns it off. Clicking the tab again restores the text.
const active = computed(() => PRESETS.findIndex((preset) => preset.code === source.value));

let timer: ReturnType<typeof setTimeout> | undefined;
watch(source, (value) => {
  clearTimeout(timer);
  timer = setTimeout(() => (live.value = value), 250);
});

const pick = (index: number) => {
  const code = PRESETS[index]!.code;
  source.value = code;
  live.value = code;
};

const SCOPE = { html, attrs, cx, raw, isHtml, join, map, range, when, choose, wrap, comment } as const;
const NAMES = Object.keys(SCOPE);
const VALUES = Object.values(SCOPE);

const errorHref = (code: number) => withBase(`/reference/errors#e${code}`);

// One line of the check result. A markup problem links to its code in the error reference. An
// accessibility finding has a rule name instead of a code, and links to the table of rules.
interface Entry {
  label: string;
  href: string;
  title: string;
  message: string;
  near: string;
}

const entry = (p: Problem | Finding): Entry => {
  const { message, near } = p;
  if ('rule' in p) {
    const href = withBase('/api/check#accessibility');
    return { label: p.rule, href, title: `${p.rule} in the accessibility rules`, message, near };
  }
  return { label: `${p.code}`, href: errorHref(p.code), title: `Code ${p.code} in the error reference`, message, near };
};

type Outcome =
  | { kind: 'markup'; markup: string; problems: Entry[] }
  | { kind: 'error'; code?: number; message: string }
  | { kind: 'empty'; message: string };

const result = computed<Outcome>(() => {
  const src = live.value.trim();
  if (!src) return { kind: 'empty', message: 'Write a template.' };

  let fn: Function;
  try {
    // A lone expression is the common case. The fallback is a function body, so
    // a preset can declare variables and return.
    fn = new Function(...NAMES, `"use strict"; return (\n${src}\n);`);
  } catch {
    try {
      fn = new Function(...NAMES, `"use strict";\n${src}`);
    } catch (e) {
      return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
    }
  }

  let value: unknown;
  try {
    value = fn(...VALUES);
  } catch (e) {
    if (e instanceof HtmlError) return { kind: 'error', code: e.code, message: e.message };
    return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
  }

  if (value === undefined) return { kind: 'empty', message: 'Nothing was returned. Add a return.' };
  const markup = String(value);
  return { kind: 'markup', markup, problems: check(markup).map(entry) };
});

const status = computed(() => {
  if (result.value.kind !== 'markup') return '';
  const n = result.value.problems.length;
  return n === 0 ? 'No problems' : n === 1 ? '1 problem' : `${n} problems`;
});

// The preview goes in a shadow root. Page CSS cannot cross the boundary, so the
// markup renders on the browser's own stylesheet, not .vp-doc. A <style> the
// reader writes stays inside and does not restyle the site.
//
// `all: inherit` makes the host take every property from its parent, so the
// preview uses the site's font, colour, line-height and color-scheme, and
// follows the theme. `display: block` keeps the host a block. That is the whole
// stylesheet; the rest is the browser's own. The rule is the weakest in the
// shadow cascade, so anything the reader writes beats it. Outer-tree rules beat
// `:host` too, so the padding and scrolling set on .pg-preview survive.
const RESET = '<style>:host{all:inherit;display:block}</style>';
const preview = ref<HTMLElement>();

watchPostEffect(() => {
  const host = preview.value;
  if (!host || result.value.kind !== 'markup') return;
  // The host remounts whenever the pane changes state, so attach lazily.
  const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  root.innerHTML = RESET + result.value.markup;
});
</script>

<template>
  <div class="pg">
    <div class="pg-tabs" role="group" aria-label="Presets">
      <button
        v-for="(preset, i) in PRESETS"
        :key="preset.name"
        type="button"
        class="pg-tab"
        :class="{ 'is-active': i === active }"
        :aria-pressed="i === active"
        @click="pick(i)"
      >
        {{ preset.name }}
      </button>
    </div>

    <div class="pg-body">
      <div class="pg-source">
        <div class="pg-head"><span class="pg-title">Template</span></div>
        <textarea
          v-model="source"
          class="pg-editor"
          aria-label="Template source"
          wrap="off"
          spellcheck="false"
          autocapitalize="off"
          autocorrect="off"
        ></textarea>
      </div>

      <div class="pg-output">
        <div v-if="result.kind === 'error'" class="pg-section">
          <div class="pg-head">
            <span class="pg-title">Output</span>
            <span v-if="result.code" class="pg-pill is-danger">Threw code {{ result.code }}</span>
            <span v-else class="pg-pill is-danger">Error</span>
          </div>
          <div class="pg-section-body">
            <div class="pg-error">{{ result.message }}</div>
            <a v-if="result.code" class="pg-error-link" :href="errorHref(result.code)">
              Code {{ result.code }} in the error reference
            </a>
          </div>
        </div>

        <div v-else-if="result.kind === 'empty'" class="pg-section">
          <div class="pg-head"><span class="pg-title">Output</span></div>
          <div class="pg-section-body">
            <div class="pg-muted">{{ result.message }}</div>
          </div>
        </div>

        <template v-else>
          <div class="pg-section">
            <div class="pg-head"><span class="pg-title">Markup</span></div>
            <div class="pg-section-body">
              <pre class="pg-markup"><code>{{ result.markup }}</code></pre>
            </div>
          </div>

          <div class="pg-section">
            <div class="pg-head"><span class="pg-title">Rendered</span></div>
            <div class="pg-section-body">
              <div ref="preview" class="pg-preview"></div>
            </div>
          </div>

          <div class="pg-section">
            <div class="pg-head">
              <span class="pg-title">Check result</span>
              <span class="pg-pill" :class="result.problems.length ? 'is-warning' : 'is-success'">
                {{ status }}
              </span>
            </div>
            <div v-if="result.problems.length" class="pg-section-body">
              <ul class="pg-problems">
                <li v-for="(problem, i) in result.problems" :key="i" class="pg-problem">
                  <div class="pg-problem-line">
                    <a class="pg-code" :href="problem.href" :title="problem.title">
                      {{ problem.label }}
                    </a>
                    <span>{{ problem.message }}</span>
                  </div>
                  <code v-if="problem.near" class="pg-near">{{ problem.near }}</code>
                </li>
              </ul>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* One framed panel, in the shape of the site's own code groups. */
.pg {
  margin: 24px 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  overflow: hidden;
  background: var(--vp-c-bg);
}

/* Preset strip: the same rules as .vp-code-group .tabs, on buttons. One row.
   It scrolls sideways on a narrow screen instead of wrapping. */
.pg-tabs {
  display: flex;
  padding: 0 4px;
  background-color: var(--vp-code-tab-bg);
  overflow-x: auto;
  overflow-y: hidden;
  box-shadow: inset 0 -1px var(--vp-code-tab-divider);
}

.pg-tab {
  position: relative;
  flex: none;
  border-bottom: 1px solid transparent;
  padding: 0 12px;
  line-height: 48px;
  font-size: 14px;
  font-weight: 500;
  color: var(--vp-code-tab-text-color);
  white-space: nowrap;
  transition: color 0.25s;
}

.pg-tab::after {
  position: absolute;
  right: 8px;
  bottom: -1px;
  left: 8px;
  z-index: 1;
  height: 2px;
  border-radius: 2px;
  content: '';
  background-color: transparent;
  transition: background-color 0.25s;
}

.pg-tab:hover {
  color: var(--vp-code-tab-hover-text-color);
}

.pg-tab.is-active {
  color: var(--vp-code-tab-active-text-color);
}

.pg-tab.is-active::after {
  background-color: var(--vp-code-tab-active-bar-color);
}

.pg-tab:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: -2px;
  border-radius: 4px;
}

/* Body: stacked, two columns from 960px. */
.pg-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
}

.pg-source {
  display: grid;
  grid-template-rows: auto 1fr;
  min-width: 0;
  /* The column paints the code-block background, so an editor dragged shorter
     than the column leaves no seam. */
  background: var(--vp-code-block-bg);
}

.pg-output {
  min-width: 0;
  border-top: 1px solid var(--vp-c-divider);
}

@media (min-width: 960px) {
  .pg-body {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .pg-output {
    border-top: 0;
    border-left: 1px solid var(--vp-c-divider);
  }
}

/* Section header rows. Both columns share one, so the first two line up. */
.pg-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: 40px;
  padding: 0 16px;
}

.pg-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-2);
  white-space: nowrap;
}

/* Editor. It stretches to the column, grows with its content where the browser
   supports field-sizing, and scrolls sideways like the site's code blocks. */
.pg-editor {
  display: block;
  align-self: stretch;
  width: 100%;
  min-width: 0;
  min-height: 280px;
  field-sizing: content;
  padding: 0 16px 16px;
  font-family: var(--vp-font-family-mono);
  font-size: 14px;
  line-height: 1.6;
  tab-size: 2;
  color: var(--vp-c-text-1);
  background: transparent;
  border: 0;
  border-radius: 0;
  resize: vertical;
  white-space: pre;
  overflow: auto;
}

.pg-editor:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: -2px;
}

/* On a phone the output stacks under the editor, so a shorter editor keeps it in reach. */
@media (max-width: 959px) {
  .pg-editor {
    min-height: 200px;
  }
}

/* Output sections. */
.pg-section + .pg-section {
  border-top: 1px solid var(--vp-c-divider);
}

.pg-section-body {
  padding: 0 16px 16px;
}

.pg-pill {
  flex: none;
  padding: 0 8px;
  border-radius: 999px;
  line-height: 20px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.pg-pill.is-success {
  color: var(--vp-c-success-1);
  background: var(--vp-c-success-soft);
}

.pg-pill.is-warning {
  color: var(--vp-c-warning-1);
  background: var(--vp-c-warning-soft);
}

.pg-pill.is-danger {
  color: var(--vp-c-danger-1);
  background: var(--vp-c-danger-soft);
}

.pg-markup {
  margin: 0;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  line-height: 1.6;
  color: var(--vp-c-text-1);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.pg-preview {
  padding: 0;
  overflow-x: auto;
}

.pg-muted {
  font-size: 14px;
  color: var(--vp-c-text-3);
}

/* Problems. The list rules undo what .vp-doc gives every ul and li. */
.pg-problems {
  margin: 0;
  padding: 0;
  list-style: none;
}

.pg-problem {
  margin: 0;
  padding: 8px 0;
}

.pg-problem:first-child {
  padding-top: 0;
}

.pg-problem + .pg-problem {
  margin-top: 0;
  border-top: 1px solid var(--vp-c-divider);
}

.pg-problem-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 14px;
  line-height: 20px;
  color: var(--vp-c-text-1);
}

.pg-code {
  flex: none;
  padding: 0 6px;
  border-radius: 4px;
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  font-weight: 600;
  line-height: 20px;
  color: var(--itsy-c-brand-on-soft);
  background: var(--vp-c-brand-soft);
  text-decoration: none;
}

.pg-code:hover {
  color: var(--itsy-c-brand-on-soft-hover);
}

.pg-near {
  display: block;
  margin-top: 4px;
  padding: 0;
  border-radius: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--vp-c-text-3);
  background: transparent;
  overflow-wrap: anywhere;
}

/* Error state. */
.pg-error {
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  line-height: 1.6;
  color: var(--vp-c-text-1);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.pg-error-link {
  display: inline-block;
  margin-top: 8px;
  font-size: 14px;
}
</style>
