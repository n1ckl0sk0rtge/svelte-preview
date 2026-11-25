# Svelte Preview

SwiftUI-style component previews for Svelte 5 in IntelliJ-based IDEs. View multiple states together, interact with each independently, and see changes after saving.

![Svelte Preview in IntelliJ showing loaded, loading, empty, and error states](docs/image/demo-preview.png)

## Install

Requires **IntelliJ Platform 2026.3+** with the **JavaScript and TypeScript** plugin, **Svelte 5.46.4+**, **Node.js 22.12+ or 24+**, and **pnpm 10.32.1**. Building the IDE plugin also requires **JDK 25**.

Download the plugin ZIP from the [latest GitHub release](https://github.com/n1ckl0sk0rtge/svelte-preview/releases/latest).
In the IDE, choose **Settings → Plugins → gear → Install Plugin from Disk**, select the ZIP, and restart if prompted.

To build the plugin from a local checkout instead:

```sh
pnpm install
pnpm build:plugin
```

The installable ZIP is written to `plugin/build/distributions/`.

In your Svelte project's package directory, install the runtime as a dev dependency:

```sh
pnpm add -D svelte-preview
```

The runtime is versioned separately from the IDE plugin and stays pinned through your project's lockfile.
To work on the runtime from a local checkout instead, run `pnpm add -D /absolute/path/to/svelte-preview/packages/runtime`.

## Use

1. Open a `.svelte` component and select **View → Tool Windows → Svelte Preview**. The local server starts automatically.
2. Click **Create preview** if the component has no preview file yet, or create a neighbouring `ComponentName.preview.ts` or `.preview.js` yourself.
3. Define named states with their props. Save to refresh the preview.

If five automatic reload requests arrive within five seconds, the preview pauses. Click **Resume preview** to load the latest changes and turn live reload back on.

For example, beside `ProductCard.svelte`:

```ts
import { definePreviews } from 'svelte-preview';
import ProductCard from './ProductCard.svelte';

// Supply sample data for the component's states.
const product = { name: 'Studio headphones', price: 129, available: true };

// Render each state in its own interactive frame.
export default definePreviews(ProductCard, {
  Default: { props: { product } },
  Loading: {
    props: { product: null, loading: true },
    viewport: { width: 320, height: 340 }
  },
  Unavailable: { props: { product: { ...product, available: false } } }
});
```

Every state needs a `props` object; use `{}` for components without inputs. TypeScript definitions check props against the component. By default, previews fill the canvas width with 24 px padding on each side and grow or shrink with their content. Resizing the tool window updates their width. Set an explicit `viewport` per state to test a fixed device size.

The panel follows the selected component. It temporarily hides for other file types and returns when you select a `.svelte` file. Manually closing it keeps it hidden until you enable it again. Toggle it for the project with **Tools → Toggle Svelte Preview**, **⌘⌥⇧P** on macOS, or **Ctrl+Alt+Shift+P** on Windows/Linux. Hidden previews stop the server. Use the bottom-right controls to zoom, and click the percentage to reset to 100%.

The preview settings menu offers **Refresh**, **Create preview**, **Open in browser**, and **Restart**. Choose a Node.js interpreter under **Settings → Tools → Svelte Preview**, then restart the preview server.

### Inspect from an IntelliJ-connected agent

Connect your harness to [IntelliJ's MCP server](https://www.jetbrains.com/help/idea/mcp-server.html), open a Svelte component, and show **Svelte Preview**. Call `svelte_preview_inspect` to discover the gallery and state names. Pass an exact `state` to read its status and rendered text from the live IDE preview. Set `include_guide: true` for setup, fixture, and browser instructions directly through MCP.

The MCP tool uses the embedded preview, including the results of interactions you already made in the panel. The bundled agent skill covers standalone use and setups without an MCP connection.

## Mock requests

Register fetch responses in a state's synchronous `setup` hook, before the component initializes:

```ts
Loaded: {
  props: {},
  setup({ http }) {
    http.get('/api/products', {
      body: [{ name: 'Studio headphones', price: 129, available: true }]
    });
  }
}
```

Use `{ pending: true }` to leave a request unresolved, `{ status: 503 }` for an error, or `{ body: null }` for an empty response. Pending requests respect cancellation, including your application's request timeout, so they may eventually show an error instead of a loading state.

For components that poll until a job finishes, return the API's normal processing response on every poll instead. For example, if your reader expects HTTP 202 and `statusType: 'PROCESSING'`:

```ts
Loading: {
  props: {},
  setup({ http }) {
    // Complete each request while keeping the reader in its polling state.
    http.get('/api/projection', {
      status: 202,
      body: { statusType: 'PROCESSING', data: null }
    });
  }
}
```

Mocks remain registered for repeated requests, each with a fresh response body. Match the status and payload to your application's polling protocol; the runtime does not interpret processing responses or disable application timeouts.

Other HTTP methods work too, such as `http.post`. Requests match by method and pathname, ignoring the origin and query string. Responses are isolated per frame; unmatched requests use the network as usual. The URL must still have the correct pathname: an undefined API base can produce a pathname containing `undefined/api/...`, which will miss a mock for `/api/...`. See [environment configuration](#environment-variables-and-api-bases) below and [ProductBrowser.preview.ts](examples/demo/src/lib/ProductBrowser.preview.ts) for the basic four states.

## Configure

Optionally add `svelte-preview.config.ts` beside the project's `package.json`:

```ts
import { defineConfig } from 'svelte-preview';

export default defineConfig({
  styles: ['./src/app.css'],
  theme: 'auto',
  viewport: 'auto',
  aliases: { '@ui': './src/lib/ui' }
});
```

Paths resolve from the package root, and `$lib` maps to `src/lib` automatically. Add any other aliases your components need to `aliases`; aliases from the app's Vite config are not loaded automatically.

The preview mounts the selected component without the app's layout or routing. Component styles are compiled, but global CSS imports, style plugins, and theme initialization from the app need to be configured separately.

### Environment variables and API bases

The runtime starts a Vite development server with the environment mode `preview`. It loads `.env`, `.env.local`, `.env.preview`, and `.env.preview.local` from the package root. It does not load `.env.development` by default or inherit settings from the application's `vite.config.*`.

For an API base read through `import.meta.env.VITE_API_BASE`, create `.env.preview`:

```dotenv
VITE_API_BASE=
```

Use the variable name your application actually reads. An empty base makes an expression such as `${import.meta.env.VITE_API_BASE}/api/products` produce `/api/products`, matching the registered mock.

To load development environment files instead, set `mode: 'development'` in the preview config. Use `define` for explicit constant overrides without writing a Vite plugin:

```ts
import { defineConfig } from 'svelte-preview';

export default defineConfig({
  mode: 'development',
  define: {
    'import.meta.env.VITE_API_BASE': JSON.stringify('')
  }
});
```

`define` follows Vite's replacement syntax: use `JSON.stringify` for string constants, including empty strings. Only Vite's client environment variables (normally `VITE_*`) are exposed automatically; this does not implement SvelteKit's `$env/*` modules.

For browser previews, `pnpm exec svelte-preview --root . --mode development` overrides the configured mode. Config functions receive the selected mode; when `mode` is selected by the config itself, the config is evaluated again with that mode. Keep config evaluation free of side effects. Restart after changing environment files, mode, or constant overrides.

### SvelteKit imports and page fixtures

Opt into preview-only SvelteKit shims to render components whose dependencies import application state. This does not start the SvelteKit router or load the app's layouts:

```ts
import { defineConfig } from 'svelte-preview';

export default defineConfig({
  sveltekit: {
    page: {
      url: '/projects/demo',
      route: { id: '/projects/[id]' },
      params: { id: 'demo' },
      data: { title: 'Demo project' }
    }
  }
});
```

Use `sveltekit: true` for the defaults: URL `http://preview.local/`, an unmatched route, empty params/data/state, status 200, and null error/form. The supported modules are:

| Import | Preview behavior |
| --- | --- |
| `$app/env`, `$app/environment` | `browser` and `dev` are true; `building` and `prerendering` are false; `version` is an empty string. |
| `$app/state` | Static `page` fixtures, an idle `navigating` object, and `updated.current`/`updated.check()` returning false. |
| `$app/navigation` | `goto()` logs the resolved destination and options in the frame's browser console and returns a resolved promise. The frame URL and page fixtures stay unchanged. |

Override page fields for a named state in its neighbouring preview definition:

```ts
export default definePreviews(ProjectTable, {
  Default: { props: {} },
  AnotherProject: {
    props: {},
    sveltekit: {
      page: {
        url: '/projects/another?tab=assets',
        params: { id: 'another' },
        data: { title: 'Another project' }
      }
    }
  }
});
```

Top-level page fields override project defaults. Objects such as `params` and `data` are replaced in full. Project defaults must be JSON-compatible; state fixtures must be structured-cloneable. Each frame gets its own copy.

Project defaults are available during module imports. State overrides apply after the preview definition is imported, before project/state setup hooks and component initialization. Read state-specific page values during component initialization or setup, rather than capturing them at module scope.

These fixtures stay static during interaction. Route loading, form actions, reactive navigation, other navigation exports, `$app/stores`, and `$env/*` are not implemented. Existing explicit aliases take precedence over the built-in shims; remove aliases for modules you want the shims to supply. State fixtures require `sveltekit` to be enabled in the project config. Restart after enabling or disabling the shims or changing aliases.

### Global styles

Include the CSS your app normally imports in its layout: base styles, fonts, design system styles, and any shared overrides. These styles load inside preview frames, keeping the gallery separate.

For example, create `src/preview.css` with the same imports, in the same order, as the app's layout. Include only packages your project uses:

```css
@import './app.css';
@import 'carbon-components-svelte/css/all.css';
@import '@carbon/charts-svelte/styles.css';
@import '@xyflow/svelte/dist/style.css';
```

Then set `styles: ['./src/preview.css']` in `svelte-preview.config.ts`. Package imports in this CSS file resolve through Vite, including package export mappings.

Global rules inside a layout component's `<style>` block are not imported by this setup. To share those rules, move them into a shared stylesheet and load it from both the app and the preview. Styles that depend on a parent element's class or inherited CSS variables also need that surrounding styling supplied in the preview.

### Tailwind CSS and other style plugins

The preview uses its own Vite setup and does not load `vite.config.*`. Add the style plugins your component needs to the preview config's `plugins` array.

For Tailwind CSS v4, use the project's existing `tailwindcss` and `@tailwindcss/vite` dependencies, or install them if missing:

```sh
pnpm add -D tailwindcss @tailwindcss/vite
```

Keep `@import 'tailwindcss';` in `src/app.css`, and configure the plugin alongside your global styles:

```ts
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'svelte-preview';

export default defineConfig({
  styles: ['./src/preview.css'],
  plugins: [tailwindcss()]
});
```

### SCSS and other preprocessors

The runtime reads the project's `svelte.config.*`. If it does not define `preprocess`, the preview defaults to `vitePreprocess()` for component styles, including `<style lang="scss">`. SCSS requires `sass` or `sass-embedded` in the Svelte project; install one if neither is present:

```sh
pnpm add -D sass
```

Existing preprocessors in `svelte.config.*` take precedence. If your app configures a custom preprocessor only in `vite.config.*`, share that configuration through `svelte.config.*` so the preview can use it too.

### App themes and layout context

The preview config's `theme` accepts `auto`, `light`, or `dark`. Auto follows the IDE or browser appearance. This sets the preview's color scheme, `data-theme` attribute, and `light`/`dark` classes; it does not initialize a design system's own theme.

For initialization shared by every component and state, add a synchronous `setup` hook to `svelte-preview.config.ts`, keeping your existing styles, plugins, and other settings. For example, Carbon's `all.css` needs the `theme` attribute on `<html>`. This applies `g100` to every preview:

```ts
import { defineConfig } from 'svelte-preview';

export default defineConfig({
  styles: ['./src/preview.css'],
  setup({ onCleanup }) {
    // Supply the Carbon theme normally initialized by the app.
    const root = document.documentElement;
    const previousTheme = root.getAttribute('theme');
    root.setAttribute('theme', 'g100');

    // Restore the document when this preview is disposed.
    onCleanup(() => {
      if (previousTheme === null) root.removeAttribute('theme');
      else root.setAttribute('theme', previousTheme);
    });
  }
});
```

Inline hooks run in the browser and must be self-contained: use their arguments, local variables, and browser globals. They cannot reference imports or variables outside the hook. Keep DOM access inside the hook so it does not run while the server loads the config.

For setup that needs imported helpers or Svelte context APIs, use `setup: './src/preview.setup.ts'` instead. That browser module must default-export a synchronous `PreviewSetup` function; import its type with `import type { PreviewSetup } from 'svelte-preview'`.

Project setup runs inside each mounted preview frame before the state's own `setup`, so a state can override shared defaults. Both hooks can supply Svelte context, register HTTP mocks, and register cleanup. Cleanup runs in reverse order, including when initialization fails. Setup hooks do not run in the gallery's metadata discovery frame.

Supply the component's required props and representative sample data as well. An empty `props: {}` does not load the data the component receives in the app. The default `viewport: 'auto'` follows the canvas width and component height, including content changes after interaction. Automatic previews keep filling the canvas when zoom changes: zooming out expands their layout width, and zooming in narrows it, allowing responsive content to reflow. Use a numeric viewport, such as `{ width: 390, height: 600 }`, for fixed device sizes or components that need a specific viewport height. A state's `viewport: 'auto'` can also override a fixed project default. Fixed viewports retain their responsive layout width when zooming.

### Applying configuration changes

Save component, preview definition, or CSS changes to refresh the preview. After changing aliases, plugins, environment settings, shim support, or Svelte compiler/preprocessor settings, choose **Svelte Preview → gear menu → Restart**. Restart also picks up changes to a locally linked runtime; the IDE plugin does not need reinstalling for runtime-only changes.

## Try the demo or browser preview

From this checkout:

```sh
pnpm install
pnpm dev
```

Open <http://127.0.0.1:4317> and choose `ProductCard.svelte` or `ProductBrowser.svelte`. To try the IDE integration, open either component under `examples/demo/src/lib` and show the Svelte Preview tool window.

For a browser preview in your own project, run:

```sh
pnpm exec svelte-preview --root . --port 4317
```

Run `pnpm exec svelte-preview install-skill` to [install the agent skill](packages/runtime/README.md#install-the-agent-skill). The [browser automation recipe](packages/runtime/README.md#inspect-with-a-browser-harness) shows how a harness can discover states, open a single state, and wait for it to mount.

## Releases and support

Download the plugin from the [latest release](https://github.com/n1ckl0sk0rtge/svelte-preview/releases/latest). See [all releases](https://github.com/n1ckl0sk0rtge/svelte-preview/releases) for change notes and downloads, and [GitHub Issues](https://github.com/n1ckl0sk0rtge/svelte-preview/issues) for support and bug reports. Plugin version bumps live on release branches, so the version on `main` may be older than the latest release.

## License

Svelte Preview, including the IDE plugin and local runtime, is licensed under the [Apache License 2.0](LICENSE).
