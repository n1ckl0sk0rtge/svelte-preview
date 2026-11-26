# Svelte Preview

Interactive component previews for Svelte 5. Define typed props and named states, mock HTTP requests, and preview components in a browser or beside your editor with the Svelte Preview JetBrains plugin.

![Svelte Preview showing a Carbon DataTable and its loading skeleton](https://raw.githubusercontent.com/n1ckl0sk0rtge/svelte-preview/main/docs/image/demo-preview.png)

## Install

Requires Svelte 5.46.4+ and Node.js 22.12+ on the 22.x line, or Node.js 24+.
Install in your Svelte project's package directory:

```sh
pnpm add -D svelte-preview
```

## Define component states

For a component that accepts a label, create `StatusBadge.preview.ts` beside `StatusBadge.svelte`.

```ts
import { definePreviews } from 'svelte-preview';
import StatusBadge from './StatusBadge.svelte';

export default definePreviews(StatusBadge, {
  Ready: { props: { label: 'Ready' } },
  Offline: { props: { label: 'Offline' } }
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

The guide covers global styles, Tailwind, SCSS, setup hooks, repository mocks, and SvelteKit fixtures. [Configuration](https://github.com/n1ckl0sk0rtge/svelte-preview/blob/main/docs/guide.md#configure) · [Repository mocking](https://github.com/n1ckl0sk0rtge/svelte-preview/blob/main/docs/guide.md#mock-repository-requests)

## Install the agent skill

For standalone previews or when your harness has no IntelliJ MCP connection, run this command from your project directory.

```sh
pnpm exec svelte-preview install-skill
```

This installs the bundled `$svelte-preview` skill at `.agents/skills/svelte-preview/SKILL.md`. It teaches agents how to define and configure previews and how to inspect them in a browser or IntelliJ. In a monorepo, pass `--root <repo-directory>` to install it for the whole repository. Share the installed file with your team by committing it. Repeating the command keeps an identical file in place and reports a conflict if the existing skill differs.

An IntelliJ-connected harness gets the same guidance from `svelte_preview_inspect` with `include_guide: true`. [IntelliJ MCP workflow](https://github.com/n1ckl0sk0rtge/svelte-preview/blob/main/docs/guide.md#intellij-mcp)

## Inspect with a browser harness

Start `pnpm exec svelte-preview --root . --port 0` from the Svelte package. Read the loopback URL from the `SVELTE_PREVIEW_READY` stdout line. Discover states in the gallery at `/?file=<component>`. Each state iframe exposes its name, URL, and configured viewport. Open a state frame, wait for `data-preview-status="mounted"`, and then wait for the expected UI. [Browser inspection and Playwright example](https://github.com/n1ckl0sk0rtge/svelte-preview/blob/main/docs/guide.md#standalone-browser-and-agent-skill)

## License

[Apache License 2.0](https://github.com/n1ckl0sk0rtge/svelte-preview/blob/main/LICENSE).
