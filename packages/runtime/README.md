# Svelte Preview

Interactive component previews for Svelte 5. Define typed props and named states, mock HTTP requests, and preview components in a browser or beside your editor with the Svelte Preview JetBrains plugin.

![Svelte Preview showing loaded, loading, empty, and error states](https://raw.githubusercontent.com/n1ckl0sk0rtge/svelte-preview/main/docs/image/demo-preview.png)

## Install

Requires Svelte 5.46.4+ and Node.js 22.12+ on the 22.x line, or Node.js 24+.
Install in your Svelte project's package directory:

```sh
pnpm add -D svelte-preview
```

## Define component states

Create `ProductCard.preview.ts` beside `ProductCard.svelte`:

```ts
import { definePreviews } from 'svelte-preview';
import ProductCard from './ProductCard.svelte';

export default definePreviews(ProductCard, {
  Default: { props: { product: { name: 'Headphones', price: 129, available: true } } },
  Loading: { props: { product: null, loading: true } }
});
```

Supply the props your component actually accepts. Every state needs a `props` object; use `{}` for components without inputs.

## Open the preview

Run a browser preview from your Svelte project's package directory:

```sh
pnpm exec svelte-preview --root . --port 4317
```

Open <http://127.0.0.1:4317>. For IDE previews, install the [Svelte Preview JetBrains plugin](https://github.com/n1ckl0sk0rtge/svelte-preview/releases/latest), open a Svelte component, and choose **View → Tool Windows → Svelte Preview**. The plugin requires IntelliJ Platform 2026.3+ with the JavaScript and TypeScript plugin and JCEF.

The runtime is installed per project and versioned independently from the IDE plugin. Commit your dependency and lockfile changes with your project.

See the [documentation](https://github.com/n1ckl0sk0rtge/svelte-preview#configure) for global styles, Tailwind, SCSS, HTTP mocks, setup hooks, and SvelteKit fixtures. Report problems through [GitHub Issues](https://github.com/n1ckl0sk0rtge/svelte-preview/issues).

## License

[Apache License 2.0](https://github.com/n1ckl0sk0rtge/svelte-preview/blob/main/LICENSE).
