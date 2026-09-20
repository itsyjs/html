// The unbundled source has no build-time `__DEV__`, so define it here. The test suite runs as the dev build.
// Loaded with `node --import ./test/setup.ts --test`.
(globalThis as { __DEV__?: boolean }).__DEV__ = true;
