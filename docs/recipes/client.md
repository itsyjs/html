# In a browser

```ts
import { Results } from './results.ts';

document.querySelector('#results').innerHTML = Results(items).markup;
```

## Behaviour goes on with a listener

Event handler attributes are refused, so behaviour is attached rather than written into the markup.
One delegated listener on a container handles a list of any size, and keeps working after the list
is re-rendered.

```ts
const list = document.querySelector('#results');

list.addEventListener('click', (e) => {
  const button = e.target.closest('button[data-url]');
  if (!button) return;
  toggleSaved(button.dataset.url);
});
```

This is why [the example in Getting started](/guide/getting-started#a-component) puts `data-url` on
the button. The markup carries the data; the listener carries the behaviour.

## Custom elements for anything stateful

For a component that owns state over time, render the markup with a template and upgrade it with a
custom element.

```ts
class SaveButton extends HTMLElement {
  connectedCallback() {
    this.addEventListener('click', () => this.toggle());
  }
  toggle() {
    const pressed = this.getAttribute('aria-pressed') === 'true';
    this.setAttribute('aria-pressed', String(!pressed));
  }
}
customElements.define('save-button', SaveButton);
```

```ts
html`<save-button ${attrs({ 'aria-pressed': saved, 'data-url': url })}>Save</save-button>`;
```

::: tip Re-render the piece, not the page
Assigning to `innerHTML` throws away the nodes inside and their state — focus, scroll position, an
open `<details>`. Ideally, render the smallest region that changed, or use a custom element that updates
itself in place.
:::

## Importing less

If the browser only needs `cx()` and `attrs()` for class and style lists,
`@itsy/html/attrs` provides them without the template scanner. See
[the import map](/reference/imports).
