# Svelte Preview

A first slice of SwiftUI-style component previews for IntelliJ-based IDEs. Open a Svelte component and view all its declared states together on a canvas, with independent interactions and small state labels below each view.

The repository contains a local Vite runtime, an IntelliJ Platform plugin, and interactive examples using props and repository-backed reads. Nothing has been published to npm or JetBrains Marketplace.

## Try the preview

Requires Node.js **22.12+ or 24+** and pnpm **10.32.1**. This first version supports **Svelte 5.46.4+**.

```sh
pnpm install
pnpm dev
```

Open <http://127.0.0.1:4317> and choose `ProductCard.svelte`. The example shows Default, Loading, and Unavailable. Click **Add to bag** to interact with the default state. Use **Refresh** in the IDE's preview settings gear, or reload the browser, to reset the views.

Choose `ProductBrowser.svelte` for a simple repository example: it imports the named `getProduct` function and renders its promise with a Svelte await block. `ProductBrowser.preview.ts` contains the sample data and uses `http.get` for Loaded, Loading, Empty, and Error. Each frame has its own responses; no live API is called.

The demo's components, repository, and configuration use plain JavaScript. Its `.preview.ts` files stay in TypeScript and contain their sample data directly.

Choose `WelcomeCard.svelte` to try the missing-preview state. It deliberately has no preview definition. The panel shows **No preview yet** with an inline **Create preview** button. Clicking it creates `WelcomeCard.preview.ts` with a Default state and empty props, then renders the component. Delete that generated file to try the empty state again. The browser component list includes components without preview definitions too.

## Use the IntelliJ plugin

The plugin targets **IntelliJ Platform 2026.3+**. Build it with **JDK 25**:

```sh
cd plugin
./gradlew buildPlugin
```

Install `plugin/build/distributions/svelte-preview-0.1.1.zip` using **Settings → Plugins → gear → Install Plugin from Disk**, then restart the IDE if prompted.

To try the example, open this repository in the IDE, open `examples/demo/src/lib/ProductCard.svelte`, and select **View → Tool Windows → Svelte Preview**. Opening the preview starts the runtime from the selected component's nearest package. It follows subsequent component selections automatically.

Preview visibility is saved per IDE project. Showing it enables previews for all Svelte files in that project; hiding it disables previews and stops the local server. Switching files never reopens a hidden preview. Use **Tools → Toggle Svelte Preview**, **⌘⌥⇧P** on macOS, or **Ctrl+Alt+Shift+P** on Windows/Linux. You can reassign **Toggle Svelte Preview** in **Settings → Keymap**.

For another Svelte or SvelteKit project, install the runtime from this checkout in that project's package directory:

```sh
pnpm add -D /absolute/path/to/svelte-preview/packages/runtime
```

Supply the component's props in a neighbouring preview file, then open the tool window. The **Preview settings** gear on the right of the **Svelte Preview** title bar contains **Refresh**, **Create preview**, **Open in browser**, and **Restart**. Creating a preview scaffolds its definition or opens an existing one without replacing it. Restart shuts down and relaunches the Node.js server. Opening in a browser also works when the IDE runtime lacks JCEF. Closing the IDE project disposes the server.

The **Node.js interpreter** selector lives in **Settings → Tools → Svelte Preview**. It uses IntelliJ's native dropdown for detected and registered local Node.js installations, including their versions. The resolved full path and version also appear below the selector. Use the browse button to add an executable that was not detected. The default follows `node` from your environment; you can also choose the project's interpreter. This selection is saved for Svelte Preview in this IDE project. Choose **Restart** from the preview gear after changing it. Node runs the local preview server; it is separate from the browser that displays the components. The plugin uses the bundled **JavaScript and TypeScript** plugin for interpreter management.

For plugin development, `cd plugin && ./gradlew runIde` starts an IDE sandbox with the plugin installed. Open this repository in that sandbox to test editor selection, preview creation, and process disposal.

## Declare states

Keep props and fixtures in ordinary JavaScript or TypeScript. TypeScript preview definitions check each state's props against the imported component's declared or inferred props:

```ts
// ProductCard.preview.ts, beside ProductCard.svelte
import { definePreviews } from 'svelte-preview';
import ProductCard from './ProductCard.svelte';
const product = {
  name: 'Studio headphones',
  price: 129,
  available: true
};

export default definePreviews(ProductCard, {
  Default: { props: { product } },
  Loading: {
    props: { product: null, loading: true },
    viewport: { width: 320, height: 340 }
  },
  Unavailable: {
    props: { product: { ...product, available: false } },
    viewport: { width: 390, height: 400 }
  }
});
```

`.preview.js` works too. Each state requires a `props` object, which can be empty for components without inputs. Callbacks and other JavaScript values remain intact; props do not pass through JSON. Each iframe loads its own copy of the fixtures and component modules.

Set `viewport` beside `props` on each named preview to choose its width and height independently. A preview without its own viewport uses the `viewport` in `svelte-preview.config.ts`, or 360 × 340 if no project default is configured. The example's Default preview uses the project default, Loading renders at 320 × 340, and Unavailable at 390 × 400. Dimensions control the actual preview canvas and are not shown as labels.

Use the canvas's bottom-right **− / percentage / +** control to zoom between 25% and 400%. Click the percentage to return to 100%. **Ctrl/⌘ + plus, minus, or 0** and holding **Ctrl/⌘ while scrolling** also work over the views. Ordinary wheel and trackpad scrolling use the browser's native canvas scrolling. Zoom scales the views' display while preserving each configured viewport and its responsive breakpoints. Captions stay readable, component interactions stay intact, and the zoom is remembered across live reloads in the same browser tab.

## Override dependencies

A preview's synchronous `setup` runs before its component initializes. It receives helpers for registering fetch responses and cleaning up custom resources, while application repositories stay ordinary named exports:

```ts
import { definePreviews } from 'svelte-preview';
import ProductBrowser from './ProductBrowser.svelte';

export default definePreviews(ProductBrowser, {
  Loaded: {
    props: {},
    setup({ http }) {
      http.get('/api/v1/projects/studio/products/headphones', {
        body: { name: 'Studio headphones', price: 129, available: true }
      });
      http.get('/api/user', { body: { name: 'Alex' } });
    }
  }
});
```

Use `http.get`, `http.post`, `http.put`, `http.patch`, `http.delete`, `http.head`, or `http.options` as many times as needed. Registrations match the HTTP method and pathname; query parameters do not change the match. Registering the same method and path again replaces its response. `{ body: data }` returns JSON with status 200, `{ status: 503 }` simulates an HTTP failure, and `{ pending: true }` keeps a request loading. Unmatched requests pass through, so development resources keep working. HTTP overrides handle request cancellation and clean themselves up when the preview closes. Keep sample data directly in the preview file.

`setup` is a general initialization hook. Use ordinary Svelte context setters or lifecycle hooks there, and register custom resource cleanup with `onCleanup`:

```ts
setup({ http, onCleanup }) {
  http.get('/api/products', { body: [] });

  const unsubscribe = notifications.subscribe(handleNotification);
  onCleanup(unsubscribe);
}
```

Cleanup callbacks run once, in reverse registration order. Returning a cleanup function from setup is also supported. Setup runs only for the selected state in each frame, not during metadata discovery, and must stay synchronous. A child's `.preview.ts` is used only when previewing that child directly.

## Project configuration

Place `svelte-preview.config.ts` in the same directory as the package's `package.json`:

```ts
import { defineConfig } from 'svelte-preview';

export default defineConfig({
  styles: ['./src/app.css'],
  theme: 'auto',
  viewport: { width: 360, height: 340 },
  aliases: { '@ui': './src/lib/ui' }
});
```

Paths resolve relative to the package root. `$lib` maps to `src/lib` automatically. The runtime uses `svelte.config.js` when present for preprocessing and compiler settings. It intentionally uses its own Vite entry rather than loading the application's `vite.config.*`, which could start other application services. Configure custom aliases above. Vite-only integrations such as Tailwind's Vite plugin are not included yet; supply ordinary or precompiled CSS for this MVP.

`theme` accepts `'auto'` (the default), `'light'`, or `'dark'`. Auto follows the IDE's light/dark appearance, including appearance changes while the preview is open. Standalone browser use follows the browser preference. An explicit theme overrides both. The gallery and component frames receive the chosen color scheme, a matching `data-theme` attribute, and a `light` or `dark` class on `<html>`. Frame media queries also follow the gallery's color scheme, using the browser's [inherited color-scheme behavior](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-color-scheme). Project CSS keeps control of its backgrounds and colors: a component with only one theme renders as provided, without recoloring or inversion. Projects without a background use the chosen scheme's default canvas.

Component, fixture, CSS, and preview-definition edits reset all preview cards after saving. Configuration changes also refresh the preview; **restart the runtime after changing aliases or Svelte compiler configuration**. Viewport dimensions must be integer CSS pixels between 100 and 4096.

For standalone use in an installed project:

```sh
pnpm exec svelte-preview --root . --port 4317
```

Omit `--port` to allocate a free port. The CLI prints `SVELTE_PREVIEW_READY {"url":"..."}` after listening; the IDE reads that message rather than assuming a fixed port. The server binds to `127.0.0.1`.

## MVP boundaries

- Previews render supplied props. They do not enumerate internal component states automatically.
- SvelteKit route loading, `$app/*` modules, and form actions are outside this version. A `+page.svelte` can be mounted with a supplied `data` prop only if it does not need the routing runtime. The `http` helper provides simple responses to fetch requests; it does not replace imported modules.
- Context providers are supported through per-preview setup. Custom layout wrappers and snippet/children authoring are not configured yet.
- Iframes separate DOM, CSS, module state, and component interactions between states. Browser storage and cookies are shared. Components execute their normal browser code, including any network requests they initiate.
- Unsaved editor changes appear after the IDE saves the file. The plugin follows `.svelte` and neighbouring preview files and keeps the last component visible while editing fixtures or CSS.

## Checks

```sh
pnpm check
pnpm test
cd plugin
./gradlew test buildPlugin verifyPluginProjectConfiguration
```

The runtime tests cover prop/setup validation, multiple fetch mocks, resource cleanup, missing-preview creation, path traversal/symlink containment, discovery, theme configuration, and actual Vite/Svelte compilation, including the provider wrapper and repository demo. The Java tests cover monorepo root selection, hoisted runtime discovery, preview-to-component mapping, and URL encoding. The preview runtime can be checked in a browser independently of the IDE.
