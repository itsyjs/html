import { defineConfig } from 'tsdown';

// One source, two builds. Each build sets `__DEV__` to `false` or `true` and
// drops the code that can then never run. Production throws bare error codes;
// dev spells out the messages. The `development` export condition in
// package.json picks the dev file.
export default defineConfig([
  {
    // Six public entries. `attrs` stands alone, so code that only needs
    // `cx`/`attrs` never pulls in the template scanner. `check`, `frame`,
    // `util` and `create` are opt-in and build on the root.
    entry: {
      index: 'src/index.ts',
      attrs: 'src/attrs.ts',
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
      'check.dev': 'src/check.ts',
      'frame.dev': 'src/frame.ts',
      'util.dev': 'src/util.ts',
      'create.dev': 'src/create.ts',
    },
    define: { __DEV__: 'true' },
    format: ['esm'],
    platform: 'neutral',
    target: 'es2022',
    // The prod build's .d.ts serves both. `types` resolves before `development`.
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
