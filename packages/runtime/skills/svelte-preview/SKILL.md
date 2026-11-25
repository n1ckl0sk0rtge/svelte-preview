---
name: svelte-preview
description: Create, update, inspect, or troubleshoot named Svelte 5 component previews with the svelte-preview runtime. Use for .preview.ts or .preview.js fixtures, rendered Svelte Preview states, or the Svelte Preview panel in IntelliJ.
---

# Svelte Preview

Svelte Preview mounts a Svelte component with named fixtures. In a workspace with several packages, work from the package containing the component and its `package.json`. Use that package's installed `svelte-preview` dev dependency. When setting up previews for a new project, add it as a dev dependency with the project's package manager.

## Define and configure previews

- Put `ComponentName.preview.ts` or `ComponentName.preview.js` beside `ComponentName.svelte`. Import `{ definePreviews }` from `svelte-preview` and import the component from its `.svelte` file. Default-export `definePreviews(Component, { Default: { props: {} } })`, replacing the example props with the component's actual inputs. Reuse existing state names and add representative states when needed.
- A state's `viewport` can be `'auto'` or `{ width, height }` in CSS pixels. Use the synchronous state `setup({ http })` hook to mock fetch before mounting. For example, `http.get('/api/products', { body: products })`. Match the real method and pathname. Use `{ pending: true }` for a loading fixture or an appropriate status and body for an error fixture.
- Set shared styles, aliases, theme, viewport, and setup in `svelte-preview.config.ts`, `.js`, or `.mjs` by the package's manifest. The runtime mounts outside the app's layouts and router. If the preview needs app CSS, theme initialization, environment values, or SvelteKit page state, configure those inputs for the preview. [Runtime configuration](https://github.com/n1ckl0sk0rtge/svelte-preview#configure)
- For manual use in IntelliJ, open the component and choose **View → Tool Windows → Svelte Preview**. The **Create preview** action scaffolds a missing definition. Save to refresh and restart the preview after changing configuration such as aliases or plugins.

## Access and inspect a rendered state

1. If you already have access to the current IntelliJ JCEF target, inspect the named iframe there to see its live interaction state. **Open in browser** in the preview menu opens the current gallery URL in a regular browser and can provide the URL to a harness that can reach the same server. For a standalone session, run `pnpm exec svelte-preview --root . --port 0` from the Svelte package and read `url` from the JSON on the `SVELTE_PREVIEW_READY` stdout line. The browser must be able to reach that loopback address.
2. Use a browser tool such as Playwright. Open `/?file=<component>` and wait for `html[data-preview-status="ready"]`. Each `iframe[data-preview-state]` exposes its exact name, `src`, and a JSON `data-preview-viewport` value. Paths are relative to the Svelte package. When the name is known, open `/__preview/frame?file=<component>&state=<name>` directly. Use `URLSearchParams` to encode the path and name.
3. For a standalone state URL, set the browser viewport to the fixed dimensions from the gallery or choose dimensions for `"auto"`. Wait for `html[data-preview-status="mounted"]` in the state document, then wait for the specific UI you need. A fixture can mount while its mocked request remains pending.
4. Inspect the rendered DOM or accessibility snapshot, interact with the component, and capture screenshots or console output as the task requires. When you report what you verified, include the component, state, and viewport.

For failures, check the navigation's HTTP status and the document's `data-preview-status`. Read `[data-preview-error]` when the status is `error`. A `missing` status means the component has no neighboring definition. A `paused` status means rapid edits stopped live reload. Use **Resume preview** to load the latest changes. [Playwright example](https://github.com/n1ckl0sk0rtge/svelte-preview/blob/main/packages/runtime/README.md#inspect-with-a-browser-harness)
