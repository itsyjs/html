import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { defineConfig } from 'vitepress';
import { run } from './run.ts';

// Every markdown file under docs/, in a stable order.
const walk = async (dir: string): Promise<string[]> => {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path)));
    else if (entry.name.endsWith('.md')) out.push(path);
  }
  return out.sort();
};

// The deploy workflow passes the repository name. A custom domain drops it.
const base = process.env.DOCS_BASE ?? '/';

// The playground imports the library source through the `#*` subpath in
// package.json, so `__DEV__` is defined here, as tsdown defines it for a
// build. Without it, error messages read `E6` and `check()` returns nothing,
// and that is most of what the site has to show.
export default defineConfig({
  title: '@itsy/html',
  description: 'Tagged-template HTML renderer. Isometric, zero dependencies, context-aware escaping.',
  base,
  cleanUrls: true,
  lastUpdated: true,
  vite: { define: { __DEV__: 'true' } },
  markdown: {
    // Both are warm and low-saturation, and sit under the orange brand better
    // than the stock GitHub pair. Only the token colors carry over. VitePress
    // paints the block from --vp-code-block-bg, so neither theme's own
    // background is used.
    //
    // Not everforest-light: it is soft by design and has a 2.79 median
    // contrast against this background, with six of its nine token colors
    // under 3:1. kanagawa-lotus is the warmest bundled light theme and reads
    // better, at 4.15. No syntax theme clears 4.5 across the board, so this is
    // a relative choice, not a passing grade.
    theme: { light: 'kanagawa-lotus', dark: 'everforest-dark' },
    config(md) {
      // A fence marked ```ts run runs at build time. Its result renders
      // beneath it as a second, highlighted fence. See run.ts.
      const fence = md.renderer.rules.fence!;
      md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const token = tokens[idx]!;
        const code = fence(tokens, idx, options, env, self);
        if (!/\brun\b/.test(token.info)) return code;
        let output;
        try {
          output = run(token.content);
        } catch (e) {
          const where = `${(env as { path?: string }).path ?? 'a page'}, fence at line ${token.map?.[0] ?? '?'}`;
          throw new Error(`runnable example failed (${where}): ${e instanceof Error ? e.message : String(e)}`, {
            cause: e,
          });
        }
        // Cloning the token keeps VitePress's own highlighting and pre-wrapper for the output.
        const out = Object.assign(Object.create(Object.getPrototypeOf(token)), token, {
          info: output.lang,
          content: output.text + '\n',
        });
        return `${code}<div class="run-output">${fence([out], 0, options, env, self)}</div>`;
      };
    },
  },
  // Two plain-text builds of the site, for tools that read it as text: an
  // index, and the whole site in one file.
  async buildEnd({ srcDir, outDir, site }) {
    const files = await walk(srcDir);
    const url = (file: string) => '/' + relative(srcDir, file).replace(/(?:index)?\.md$/, '');
    const pages = await Promise.all(
      files.map(async (file) => {
        const body = await readFile(file, 'utf8');
        // The first heading, else the frontmatter title, else the path.
        const heading = /^#\s+(.+)$/m.exec(body)?.[1] ?? /^title:\s*(.+)$/m.exec(body)?.[1];
        const title = url(file) === '/' ? site.title : (heading ?? url(file));
        return { url: url(file), title: title.replace(/`/g, ''), body };
      }),
    );

    // Site order, not alphabetical: the index is meant to be read top to bottom.
    const ORDER = ['/', '/guide/', '/security/', '/recipes/', '/api/', '/reference/', '/playground'];
    const rank = (u: string) => {
      const i = ORDER.findIndex((prefix) => (prefix === '/' ? u === '/' : u.startsWith(prefix)));
      return i === -1 ? ORDER.length : i;
    };
    pages.sort((a, b) => rank(a.url) - rank(b.url));

    const index = pages.map((p) => `- [${p.title}](${p.url})`).join('\n');
    await writeFile(join(outDir, 'llms.txt'), `# ${site.title}\n\n${site.description}\n\n${index}\n`);

    const agents = await readFile(join(srcDir, '..', 'AGENTS.md'), 'utf8');
    const full = pages.map((p) => `\n\n<!-- ${p.url} -->\n\n${p.body}`).join('');
    await writeFile(join(outDir, 'llms-full.txt'), agents + full);
  },
  // VitePress adds the base to `themeConfig.logo` but not to head hrefs. These
  // carry the base themselves, or they 404 on Pages.
  head: [
    ['meta', { name: 'theme-color', content: '#e34f26' }],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon.svg` }],
    ['link', { rel: 'apple-touch-icon', href: `${base}apple-touch-icon.png` }],
  ],
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Guide', link: '/guide/getting-started', activeMatch: '^/(guide|security|recipes)/' },
      { text: 'API', link: '/api/html', activeMatch: '^/(api|reference)/' },
      { text: 'Playground', link: '/playground' },
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting started', link: '/guide/getting-started' },
          { text: 'Writing HTML', link: '/guide/writing-html' },
          { text: 'Full documents', link: '/guide/documents' },
          { text: 'Checks', link: '/guide/checks' },
        ],
      },
      {
        text: 'Security',
        collapsed: false,
        items: [
          { text: 'The URL guard', link: '/security/url-guard' },
          { text: 'What it does not do', link: '/security/limits' },
        ],
      },
      {
        text: 'Recipes',
        collapsed: false,
        items: [
          { text: 'On a server', link: '/recipes/server' },
          { text: 'In a browser', link: '/recipes/client' },
          { text: 'Bundlers and editors', link: '/recipes/tooling' },
          { text: 'Testing', link: '/recipes/testing' },
        ],
      },
      {
        text: 'API',
        collapsed: false,
        items: [
          { text: '@itsy/html', link: '/api/html' },
          { text: '/attrs', link: '/api/attrs' },
          { text: '/util', link: '/api/util' },
          { text: '/frame', link: '/api/frame' },
          { text: '/check', link: '/api/check' },
          { text: '/create', link: '/api/create' },
        ],
      },
      {
        text: 'Reference',
        collapsed: false,
        items: [
          { text: 'Error codes', link: '/reference/errors' },
          { text: 'Import map', link: '/reference/imports' },
          { text: 'Types', link: '/reference/types' },
          { text: 'Benchmarks', link: '/reference/benchmarks' },
          { text: 'For coding agents', link: '/reference/agents' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/itsyjs/html' }],
    search: { provider: 'local' },
    outline: [2, 3],
    editLink: {
      pattern: 'https://github.com/itsyjs/html/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
    footer: { message: 'MIT licensed.', copyright: 'Copyright © Dave Honneffer' },
  },
});
