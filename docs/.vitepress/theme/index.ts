import type { Theme } from 'vitepress';
import DefaultTheme from 'vitepress/theme';
import '@fontsource-variable/source-sans-3';
import '@fontsource-variable/source-code-pro';
import './vars.css';
import './custom.css';
import Playground from './components/Playground.vue';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('Playground', Playground);
  },
} satisfies Theme;
