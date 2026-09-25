// The unbundled source has no build-time `__DEV__`, so this file sets it. The tests run as the dev build.
// Loaded with `node --import ./test/setup.ts --test`.
(globalThis as { __DEV__?: boolean }).__DEV__ = true;
