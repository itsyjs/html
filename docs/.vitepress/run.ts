// Evaluates a ```ts run fence at docs build time and returns what to show
// beneath it. Runs in Node against the library source (the `#*` subpaths in
// package.json), so a broken example fails the build rather than the reader.
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import type { Html, HtmlError } from '#index';
import type { Finding, Problem } from '#check';

// The unbundled source has no build-time `__DEV__`. Set it before the library
// loads, so error messages and `check()` behave as they do in the dev build.
(globalThis as { __DEV__?: boolean }).__DEV__ = true;

// Every runtime export of every public entry, as one flat scope. A dynamic
// import with a variable keeps Vite's config bundler from inlining these, so
// Node resolves the subpaths itself.
const ENTRIES = ['#index', '#attrs', '#util', '#frame', '#check', '#create'];
const scope: Record<string, unknown> = {};
for (const entry of ENTRIES) Object.assign(scope, await import(/* @vite-ignore */ entry));

const isHtml = scope.isHtml as (value: unknown) => value is Html;
const HtmlErrorClass = scope.HtmlError as typeof HtmlError;

// A language and body for the output fence.
export interface Output {
  lang: string;
  text: string;
}

// A markup problem carries a numeric code; an accessibility finding carries a rule name.
const isProblem = (x: unknown): x is Problem | Finding =>
  typeof x === 'object' &&
  x !== null &&
  typeof (x as Problem).message === 'string' &&
  (typeof (x as Problem).code === 'number' || typeof (x as Finding).rule === 'string');

const problem = (p: Problem | Finding) =>
  `${'rule' in p ? p.rule : `E${p.code}`}: ${p.message}${p.near ? ` — near "${p.near}"` : ''}`;

// The library's own imports are stripped and its exports provided as globals,
// so an example can import or not, whichever reads best. `export` is dropped
// from declarations for the same reason. Any other import is a build error:
// such an example cannot be runnable.
const prepare = (source: string) =>
  stripTypeScriptTypes(
    source
      .replace(/^import\s[^;]*?from\s*['"]@itsy\/html(?:\/[\w-]+)?['"];?[ \t]*$/gm, '')
      .replace(/^export\s+(?=(?:const|let|var|function|class)\b)/gm, ''),
    { mode: 'strip' },
  );

/** Runs one example and returns the fence to render beneath it. Throws when the example is broken. */
export const run = (source: string): Output => {
  const script = new vm.Script(prepare(source), { filename: 'example.ts' });
  let value: unknown;
  try {
    // The completion value: whatever the last expression statement evaluated to.
    value = script.runInNewContext({ ...scope });
  } catch (e) {
    // A documented outcome, not a broken example.
    if (e instanceof HtmlErrorClass) return { lang: 'txt', text: `HtmlError E${e.code}: ${e.message}` };
    throw e;
  }
  if (value === undefined) throw new Error('the example produced nothing: end it with an expression');
  if (isHtml(value) || typeof value === 'string') return { lang: 'html', text: String(value) };
  if (Array.isArray(value) && value.length && value.every(isProblem)) {
    return { lang: 'txt', text: value.map(problem).join('\n') };
  }
  return { lang: 'json', text: JSON.stringify(value, null, 2) };
};
