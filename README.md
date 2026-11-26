# Svelte Preview

SwiftUI-style component previews for Svelte 5 in IntelliJ-based IDEs. View several states side by side, interact with each independently, and see changes after saving. The preview also runs in a standalone browser.

![Svelte Preview in IntelliJ showing a Carbon DataTable and its loading skeleton](docs/image/demo-preview.png)

## Install

The runtime requires **Svelte 5.46.4+** and **Node.js 22.12+ on the 22.x line, or Node.js 24+**. The IDE plugin requires **IntelliJ Platform 2026.3+**, the **JavaScript and TypeScript** plugin, and **JCEF**.

1. Download the plugin ZIP. [Latest GitHub release](https://github.com/n1ckl0sk0rtge/svelte-preview/releases/latest)
2. In the IDE, choose **Settings → Plugins → gear → Install Plugin from Disk**, select the ZIP, and restart if prompted.
3. Install the runtime in your Svelte project's package directory.

```sh
pnpm add -D svelte-preview
```

The runtime and IDE plugin are versioned independently. The runtime stays pinned through your project's lockfile.

## Use

1. Open a `.svelte` component and select **View → Tool Windows → Svelte Preview**.
2. Click **Create preview** to add a neighboring `ComponentName.preview.ts` or `.preview.js`.
3. Define named states with `definePreviews(Component, states)`. Each state has a `props` object. Use `{}` for a component without inputs. Save to refresh the preview.

For a standalone preview, run `pnpm exec svelte-preview --root . --port 4317` from the Svelte package and open <http://127.0.0.1:4317>.

## Try the demo

Run these commands from this checkout with pnpm 10.32.1.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://127.0.0.1:4317> and choose `ServicesTable.svelte`. In IntelliJ, open the component and show the **Svelte Preview** tool window. [Demo component](examples/demo/src/lib/ServicesTable.svelte)

The dark Carbon DataTable has **Loaded**, **Loading**, **Empty**, and **Error** states. Each state mocks the HTTP response to the same repository call. The loading fixture keeps the request pending so the Carbon skeleton stays visible. [Preview states](examples/demo/src/lib/ServicesTable.preview.ts) · [Repository mocking guide](docs/guide.md#mock-repository-requests)

## Inspect from an IntelliJ-connected agent

With the harness connected to IntelliJ's MCP server, call `svelte_preview_inspect` to list the active preview's states. Pass an exact `state` to read its rendered text and status. Set `include_guide: true` for setup and inspection instructions. The tool reads the live IDE preview, including while you switch tabs. [IntelliJ MCP workflow](docs/guide.md#intellij-mcp)

For standalone use, the optional agent skill explains how to set up and inspect previews. Install it with `pnpm exec svelte-preview install-skill`. [Browser inspection and skill setup](docs/guide.md#standalone-browser-and-agent-skill)

## Documentation

- Work with preview states, viewports, and IDE controls. [Svelte Preview guide](docs/guide.md)
- Configure shared styles, app themes, aliases, environment variables, and SvelteKit fixtures. [Configuration](docs/guide.md#configure)
- Build the plugin or link the runtime locally. [Source checkout](docs/guide.md#work-from-a-source-checkout)

## Releases and support

Find change notes and downloads on GitHub. [Releases](https://github.com/n1ckl0sk0rtge/svelte-preview/releases) · [Issues](https://github.com/n1ckl0sk0rtge/svelte-preview/issues)

## License

[Apache License 2.0](LICENSE).
