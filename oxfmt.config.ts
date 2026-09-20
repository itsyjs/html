import { defineConfig } from 'oxfmt';

export default defineConfig({
  singleQuote: true,
  semi: true,
  printWidth: 120,
  // Prettier-style formatters rewrite the markup inside html`…` templates
  // (`<br>` becomes `<br />`, a `;` grows in a script hole). Off keeps it literal.
  embeddedLanguageFormatting: 'off',
  ignorePatterns: ['bench/**', 'dist/**', 'docs/.vitepress/cache/**', 'docs/.vitepress/dist/**'],
});
