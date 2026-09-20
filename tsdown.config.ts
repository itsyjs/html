import { defineConfig } from 'tsdown';

// One source, two builds. The build replaces `__DEV__` with `false` or `true`
// and drops the code that can then never run: production throws bare error
// codes, dev spells the messages out. package.json's `development` export
// condition picks the dev file.
export default defineConfig([
  {
    // Six public entries. `attrs` stands alone so a consumer who only wants
    // `cx`/`attrs` in a class attribute never pulls in the template scanner;
    // `check`, `frame`, `util` and `create` are opt-in and build on the root.
    entry: {
      index: 'src/index.ts',
      attrs: 'src/attrs.ts',
      a11y: 'src/a11y.ts',
      check: 'src/check.ts',
      frame: 'src/frame.ts',
      util: 'src/util.ts',
      create: 'src/create.ts',
    },
    define: { __DEV__: 'false' },
    format: ['esm'],
    // Only web-standard globals are used; no Node built-ins.
    platform: 'neutral',
    target: 'es2022',
    dts: true,
    treeshake: true,
    minify: true,
    clean: true,
    hash: false,
    outputOptions: {
      chunkFileNames: 'chunk-[name].js',
    },
  },
  {
    entry: {
      'index.dev': 'src/index.ts',
      'attrs.dev': 'src/attrs.ts',
      'a11y.dev': 'src/a11y.ts',
      'check.dev': 'src/check.ts',
      'frame.dev': 'src/frame.ts',
      'util.dev': 'src/util.ts',
      'create.dev': 'src/create.ts',
    },
    define: { __DEV__: 'true' },
    format: ['esm'],
    platform: 'neutral',
    target: 'es2022',
    // The prod build's .d.ts serves both; `types` resolves before `development`.
    dts: false,
    treeshake: true,
    minify: true,
    clean: false,
    hash: false,
    outputOptions: {
      chunkFileNames: 'chunk-[name].dev.js',
    },
  },
]);
