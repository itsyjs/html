import { defineConfig } from 'oxlint';

export default defineConfig({
  env: { node: true, es2024: true },
  ignorePatterns: ['bench/**', 'dist/**', 'docs/.vitepress/cache/**', 'docs/.vitepress/dist/**'],
  options: { typeAware: true },
  // Build-time flag; see src/globals.d.ts.
  globals: { __DEV__: 'readonly' },
  rules: {
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
  },
  overrides: [
    {
      // The docs sit outside every tsconfig `include`, so the type-aware rules
      // have no program to ask. Widening the root tsconfig would pull the docs
      // into `pnpm typecheck`, which has no DOM lib on purpose.
      files: ['docs/**'],
      plugins: [],
      rules: {},
    },
    {
      files: ['test/**'],
      rules: {
        'typescript/no-floating-promises': 'off',
        'typescript/no-base-to-string': 'off',
        'typescript/restrict-template-expressions': 'off',
      },
    },
  ],
});
