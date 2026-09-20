// A flag the build replaces with a literal: `false` in `dist/index.js`, `true`
// in `dist/index.dev.js`. Neither built file mentions it afterwards. When the
// unbundled source runs (the test suite), `test/setup.ts` defines it.
declare const __DEV__: boolean;
