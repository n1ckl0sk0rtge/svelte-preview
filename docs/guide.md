# Svelte Preview guide

Start with the [installation instructions](../README.md#install) and the [Carbon table demo](../README.md#try-the-demo).

## Define preview states

1. Open a `.svelte` component and choose **View → Tool Windows → Svelte Preview**. The IDE starts the local runtime for that component's package.
2. Choose **Create preview** or add a neighboring `ComponentName.preview.ts` or `ComponentName.preview.js` file.
3. Default-export `definePreviews(Component, states)`. Give every state a `props` object, using `{}` when the component needs no inputs. TypeScript checks each state's props against the component.
4. Save to refresh the preview. Each named state runs in its own iframe and can be interacted with independently.

For a component that accepts a `label` prop, create `StatusBadge.preview.ts` beside `StatusBadge.svelte`.

```ts
import { definePreviews } from 'svelte-preview';
import StatusBadge from './StatusBadge.svelte';

export default definePreviews(StatusBadge, {
  Ready: { props: { label: 'Ready' } },
  Offline: { props: { label: 'Offline' } }
});
```

The panel follows the selected Svelte component and temporarily hides on other file types. The last preview stays available to MCP while you switch tabs or open another tool window. To stop the server, close the preview panel or toggle it off using **Tools → Toggle Svelte Preview**, **⌘⌥⇧P** on macOS, or **Ctrl+Alt+Shift+P** on Windows/Linux.

Use the gear menu to **Refresh**, **Create preview**, **Open in browser**, or **Restart**. Choose a Node.js interpreter under **Settings → Tools → Svelte Preview** and restart the preview after changing it. If five automatic reloads arrive within five seconds, choose **Resume preview** to load the latest changes.

By default, each state fills the canvas with 24 px of padding per side and follows its content height. For a fixed viewport, set `viewport: { width: 390, height: 600 }` on a state or in project config. A state can override a fixed project default with `viewport: 'auto'`. Automatic previews reflow as the canvas width or zoom changes. Fixed previews retain their layout dimensions while zoom scales the display. Click the zoom percentage to reset it to 100%.

## Mock repository requests

The demo's Svelte component calls `listServices` as it would in the app. The repository fetches `/api/v1/projects/studio/services`. Each preview's synchronous `setup` hook registers a response for that path before the component mounts. [Component](../examples/demo/src/lib/ServicesTable.svelte) · [Repository](../examples/demo/src/lib/infrastructure/ServiceRepository.js) · [Preview states](../examples/demo/src/lib/ServicesTable.preview.ts)

| State | Mock response | Result |
| --- | --- | --- |
| Loaded | Array of service endpoints | Sortable Carbon `DataTable` |
| Loading | `{ pending: true }` | Carbon `DataTableSkeleton` |
| Empty | `{ body: [] }` | Empty table and an explanatory message |
| Error | `{ status: 503 }` | Error message from the repository |

For example, this fixture keeps the table in its loading state.

```ts
Loading: {
  props: {},
  setup({ http }) {
    http.get('/api/v1/projects/studio/services', { pending: true });
  }
}
```

Return the response shape your repository expects. For an empty response that uses `null`, register `{ body: null }`. Requests match by HTTP method and pathname. Origins and query strings are ignored. Each frame has its own mocks, and requests that miss a mock use the network. If a mock misses, check the actual path and the [API base configuration](#environment-variables-and-api-bases).

Pending responses honor cancellation and any application request timeouts. For a component that polls until a job finishes, return the API's processing response on each poll. The runtime returns a fresh response body for every matching request.

```ts
Loading: {
  props: {},
  setup({ http }) {
    // Keep the polling client in its processing state.
    http.get('/api/projection', {
      status: 202,
      body: { statusType: 'PROCESSING', data: null }
    });
  }
}
```

## Configure

Add `svelte-preview.config.ts`, `.js`, or `.mjs` beside the Svelte package's `package.json`.

```ts
import { defineConfig } from 'svelte-preview';

export default defineConfig({
  styles: ['./src/app.css'],
  theme: 'auto',
  viewport: 'auto',
  aliases: { '@ui': './src/lib/ui' }
});
```

Paths resolve from the package root. The runtime uses its own Vite config and maps `$lib` to `src/lib`. Declare any additional aliases and Vite plugins in the preview config. The preview mounts the selected component directly, so supply its props, global CSS, theme initialization, and layout context as needed.

### Global styles and design systems

Load the styles your app normally loads in its layout, in the same order. For the Carbon demo, `src/app.css` imports `carbon-components-svelte/css/g100.css` and the preview config sets `theme: 'dark'`. The stylesheet applies the Carbon theme inside the frame. The runtime theme controls the preview appearance and sets the frame's color scheme, `data-theme`, and `light` or `dark` classes. Use `theme: 'auto'` to follow the IDE or browser. [Demo stylesheet](../examples/demo/src/app.css) · [Demo config](../examples/demo/svelte-preview.config.js)

For projects with shared styles, create a stylesheet such as `src/preview.css` and include the packages your component actually uses. List it in `styles`.

```css
@import './app.css';
@import 'carbon-components-svelte/css/all.css';
@import '@carbon/charts-svelte/styles.css';
@import '@xyflow/svelte/dist/style.css';
```

Move reusable rules from an app layout's `<style>` block to a shared stylesheet so both the app and preview can load them. If selectors depend on an ancestor class or CSS variable, supply that context in the preview as well.

### Project setup and layout context

Use a synchronous project `setup` hook for initialization shared by every state. For example, when using Carbon's `all.css` with a theme attribute, apply `g100` to the frame and restore the previous value during cleanup.

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

Inline hooks run in the browser and must be self-contained. Use their arguments, local variables, and browser globals. For helpers that need imports, set `setup: './src/preview.setup.ts'` and default-export a synchronous function typed with `import type { PreviewSetup } from 'svelte-preview'`.

Project setup runs before state setup in each mounted frame. Both hooks can supply Svelte context, register HTTP mocks, and register cleanup. Later registrations can override earlier defaults. Cleanup runs in reverse order, including after initialization errors. The gallery's metadata discovery imports the definition without running the setup hooks.

### Tailwind CSS and preprocessors

For Tailwind CSS v4, use the project's `tailwindcss` and `@tailwindcss/vite` dependencies. Keep `@import 'tailwindcss';` in the stylesheet and add the plugin to the preview config alongside your styles.

```ts
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'svelte-preview';

export default defineConfig({
  styles: ['./src/app.css'],
  plugins: [tailwindcss()]
});
```

The runtime reads preprocessors from `svelte.config.*` and defaults to `vitePreprocess()`. Install `sass` or `sass-embedded` in the Svelte package for `<style lang="scss">`. If the app configures a preprocessor in Vite, share it through `svelte.config.*` so the preview can use it.

### Environment variables and API bases

The runtime starts Vite in `preview` mode by default. It loads `.env`, `.env.local`, `.env.preview`, and `.env.preview.local` from the package root and exposes Vite client variables such as `VITE_*`.

If a component builds request paths from `import.meta.env.VITE_API_BASE`, use an empty value in `.env.preview` to turn `${import.meta.env.VITE_API_BASE}/api/services` into the path `/api/services`.

```dotenv
VITE_API_BASE=
```

Set `mode: 'development'` in the preview config to load development environment files. Use `define` with `JSON.stringify` for a string override.

```ts
import { defineConfig } from 'svelte-preview';

export default defineConfig({
  mode: 'development',
  define: {
    'import.meta.env.VITE_API_BASE': JSON.stringify('')
  }
});
```

For browser previews, `pnpm exec svelte-preview --root . --mode development` overrides the configured mode. Config functions receive the selected mode. When the config sets a different mode, the runtime evaluates it again with that mode. Keep config evaluation free of side effects.

### SvelteKit page fixtures

Enable `sveltekit: true` for the default preview page, or supply project fixtures for components that read application state.

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

The default page has URL `http://preview.local/`, an unmatched route, empty params, data and state, status 200, and null error and form.

| Import | Preview behavior |
| --- | --- |
| `$app/env`, `$app/environment` | `browser` and `dev` are true. `building` and `prerendering` are false. `version` is an empty string. |
| `$app/state` | Static `page` fixtures, an idle `navigating` object, and `updated.current` and `updated.check()` returning false. |
| `$app/navigation` | `goto()` logs the resolved destination and options to the frame console and returns a resolved promise. |

Once enabled, override top-level page fields with `sveltekit.page` in an individual state.

```ts
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
```

Values such as `params` and `data` replace the corresponding project defaults in full. Project defaults must be JSON-compatible and state overrides must be structured-cloneable. Each frame gets its own copy.

Project defaults are available during module imports. State overrides are applied before setup hooks and component initialization, so read state-specific values during setup or initialization. Explicit aliases take precedence over the shims. Use the running SvelteKit app for route loading, form actions, layouts, and reactive navigation. Components that import additional modules such as `$app/stores` or `$env/*` can supply their own preview aliases.

### Apply configuration changes

Save component, preview definition, or CSS edits to refresh. Use **Svelte Preview → gear → Restart** for changes to aliases, style plugins, environment settings, SvelteKit shims, compiler settings, or a locally linked runtime.

## Inspect previews with an agent

### IntelliJ MCP

Connect the harness to the IDE's MCP server, open a Svelte component, and show the **Svelte Preview** tool window. Call `svelte_preview_inspect` to discover named states, their URLs, configured viewports, and render statuses. Pass an exact `state` such as `Loading` to read its live rendered text or error. The tool sees interactions already made in the IDE and still reads the preview when focus moves to another tab. Set `include_guide: true` to get setup and inspection instructions through MCP. [JetBrains MCP setup](https://www.jetbrains.com/help/idea/mcp-server.html)

### Standalone browser and agent skill

If the preview is already running in IntelliJ, use **Open in browser** from the preview's gear menu to get the current gallery URL. For a standalone session, start the runtime from the Svelte package. Use `--port 0` for an available port and read the URL from the JSON on the `SVELTE_PREVIEW_READY` stdout line. The browser needs access to that loopback address.

```sh
pnpm exec svelte-preview --root . --port 0
```

For repeatable browser or CI checks, discover states in the gallery at `/?file=<component>`. Once `data-preview-status` is `ready`, each `iframe[data-preview-state]` exposes its name, `src`, and JSON `data-preview-viewport`. Open the frame directly with `/__preview/frame?file=<component>&state=<name>` and encode both parameters using `URLSearchParams`. Use the configured dimensions for a fixed viewport and choose your own dimensions for `"auto"`.

Check the HTTP response and read `data-preview-status` on `<html>`. A frame reports `mounted` after Svelte's initial mount. Wait for the UI you expect, since a fixture can mount while its request remains pending. For `error`, read `[data-preview-error]`. The `missing` status signals a missing preview definition, and `paused` signals a pause after rapid edits.

Run the command from `examples/demo` to try this Playwright example. It uses an existing `page` and the runtime's URL as `baseUrl`.

```js
async function openPreview(url, expected) {
  // Check the document response before waiting for the render status.
  const response = await page.goto(url);
  if (!response?.ok()) throw new Error(`Preview request failed: ${response?.status()}`);
  const rendered = page.locator('html[data-preview-status]:not([data-preview-status="loading"])');
  const status = await rendered.getAttribute('data-preview-status', { timeout: 15_000 });
  if (status === 'error') throw new Error(await page.locator('[data-preview-error]').innerText());
  if (status !== expected) throw new Error(`Preview status: ${status}`);
}

// Read the state link and viewport from the gallery.
const gallery = new URL('/', baseUrl);
gallery.searchParams.set('file', 'src/lib/ServicesTable.svelte');
await openPreview(gallery.href, 'ready');
const frame = page.locator('iframe[data-preview-state="Loaded"]');
const { url, viewport } = await frame.evaluate(element => ({
  url: element.src,
  viewport: JSON.parse(element.dataset.previewViewport)
}));

// Mount the state at its configured size and wait for the table.
if (viewport !== 'auto') await page.setViewportSize(viewport);
await openPreview(url, 'mounted');
await page.getByRole('heading', { name: 'Service endpoints' }).waitFor();
await page.getByRole('cell', { name: 'Edge gateway' }).waitFor();
```

For a harness without an IntelliJ MCP connection, install the bundled skill from your project directory. It explains preview setup and browser inspection without relying on an IDE connection.

```sh
pnpm exec svelte-preview install-skill
```

The installer writes `.agents/skills/svelte-preview/SKILL.md`. Pass `--root <repo-directory>` to place it at a monorepo root. It preserves local edits and reports a conflict if the existing file differs.

## Work from a source checkout

Install this repository's workspace dependencies with the pinned pnpm version. To use the checked-out runtime in another project, run `pnpm add -D /absolute/path/to/svelte-preview/packages/runtime` from that project's Svelte package.

With JDK 25, build the IntelliJ plugin from the repository root.

```sh
pnpm install --frozen-lockfile
pnpm build:plugin
```

The ZIP is written to `plugin/build/distributions/`. Install it through **Settings → Plugins → gear → Install Plugin from Disk**.
