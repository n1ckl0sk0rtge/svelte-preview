import { existsSync, realpathSync } from 'node:fs';
import { access, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, loadConfigFromFile, normalizePath } from 'vite';
import { loadSvelteConfig, svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { validateViewport } from './index.mjs';

const runtimeRoot = fileURLToPath(new URL('.', import.meta.url));
const prefix = '/@svelte-preview/';
const kitPrefix = 'virtual:svelte-preview/sveltekit/';
const configNames = ['svelte-preview.config.ts', 'svelte-preview.config.js', 'svelte-preview.config.mjs'];
const reloadLimit = 5;
const reloadWindowMs = 5_000;
const pausedContent = `<section class="sp-setup" aria-labelledby="sp-paused-title">
  <h1 id="sp-paused-title" class="sp-setup-title">Preview paused</h1>
  <p class="sp-empty">Several changes arrived in quick succession.</p>
  <button type="button" id="sp-resume" class="sp-create" disabled>Resume preview</button>
  <p id="sp-resume-status" class="sp-setup-status" role="alert"></p>
</section>`;
const kitModules = new Map([
  ['$app/environment', 'environment'],
  ['$app/env', 'environment'],
  ['$app/state', 'state'],
  ['$app/navigation', 'navigation']
]);
const ignoredDirectories = new Set(['node_modules', '.git', '.svelte-kit', '.idea', '.gradle', 'build', 'dist', 'output']);

export async function resolveComponent(root, value) {
  // Resolve real paths before checking containment, including symlink escapes.
  if (!value || !value.endsWith('.svelte')) throw new Error('Select a .svelte component.');
  const canonicalRoot = await realpath(root);
  const component = await realpath(path.resolve(canonicalRoot, value));
  const relative = path.relative(canonicalRoot, component);
  if (relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error('The component must be inside the preview project.');
  }

  // Prefer typed neighbouring previews and allow JavaScript for non-TypeScript projects.
  const stem = component.slice(0, -'.svelte'.length);
  for (const extension of ['.preview.ts', '.preview.js']) {
    const candidate = stem + extension;
    if (existsSync(candidate)) {
      const preview = await realpath(candidate);
      const previewRelative = path.relative(canonicalRoot, preview);
      if (previewRelative.startsWith('..') || path.isAbsolute(previewRelative)) throw new Error('Preview file must be inside the project.');
      return { component, preview, relative: normalizePath(relative) };
    }
  }
  return { component, preview: null, relative: normalizePath(relative) };
}

async function listComponents(root, directory = root) {
  // Include components awaiting their first preview; skip generated and dependency trees.
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory() && !ignoredDirectories.has(entry.name) && !entry.name.startsWith('.')) {
      return listComponents(root, absolute);
    }
    if (entry.isFile() && entry.name.endsWith('.svelte')) {
      return [normalizePath(path.relative(root, absolute))];
    }
    return [];
  }));
  return nested.flat().sort();
}

function validateMode(mode) {
  if (typeof mode !== 'string' || !mode.trim() || mode === 'local') {
    throw new Error('Preview mode must be a non-empty string other than local.');
  }
}

async function readConfig(root, mode) {
  // Load a dedicated config so previewing a component never starts the application's server hooks.
  const file = configNames.map((name) => path.join(root, name)).find(existsSync);
  const result = file ? await loadConfigFromFile({ command: 'serve', mode }, file, root, 'silent') : null;
  const config = result?.config ?? {};
  const viewport = config.viewport ?? 'auto';
  validateViewport(viewport);
  const theme = config.theme ?? 'auto';
  if (!['auto', 'light', 'dark'].includes(theme)) throw new Error('Preview theme must be auto, light, or dark.');

  // Reject malformed environment and shim options before starting the listener.
  if (config.mode !== undefined) validateMode(config.mode);
  if (config.sveltekit !== undefined && typeof config.sveltekit !== 'boolean'
    && (!config.sveltekit || typeof config.sveltekit !== 'object' || Array.isArray(config.sveltekit))) {
    throw new Error('Preview sveltekit must be a boolean or an object with page fixtures.');
  }
  const page = config.sveltekit?.page;
  if (page !== undefined && (!page || typeof page !== 'object' || Array.isArray(page))) {
    throw new Error('Preview sveltekit.page must be a page fixture object.');
  }

  // Validate browser setup and CSS imports before Vite compiles the preview entry.
  if (config.setup != null && !['function', 'string'].includes(typeof config.setup)) {
    throw new Error('Preview setup must be a function or a browser module path.');
  }
  const setup = typeof config.setup === 'string' ? path.resolve(root, config.setup) : config.setup ?? null;
  if (typeof setup === 'string') await access(setup);
  const styles = (config.styles ?? []).map((style) => path.resolve(root, style));
  for (const style of styles) await access(style);
  return { config: { ...config, viewport, styles, theme, setup }, dependencies: result?.dependencies ?? [] };
}

function inlineSetupExpression(setup) {
  // Preserve browser code without invoking it or importing the server config into frames.
  const source = Function.prototype.toString.call(setup);
  try {
    new Function(`return (${source});`);
    return `(${source})`;
  } catch {
    // Object method shorthand needs its object wrapper to remain valid JavaScript.
    return `Object.values({${source}})[0]`;
  }
}

function documentHtml(entry, theme, { content = '', status = 'loading', previewEntry } = {}) {
  // Publish the initial status before JavaScript runs and pass the selected module to the client.
  const moduleAttribute = previewEntry ? ` data-preview-entry="${previewEntry}"` : '';
  return `<!doctype html><html lang="en" data-preview-theme="${theme}" data-preview-status="${status}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Svelte Preview</title></head><body><div id="app"${moduleAttribute}>${content}</div><script type="module" src="${entry}"></script></body></html>`;
}

export async function startPreviewServer({ root = process.cwd(), port = 0, mode } = {}) {
  // Reuse the project's Svelte configuration and aliases without booting SvelteKit routing.
  root = realpathSync(root);
  if (mode !== undefined) validateMode(mode);
  const defaultMode = mode ?? 'preview';
  let initial = await readConfig(root, defaultMode);
  const effectiveMode = mode ?? initial.config.mode ?? defaultMode;
  if (effectiveMode !== defaultMode) initial = await readConfig(root, effectiveMode);
  const initialConfig = initial.config;
  const aliases = Object.fromEntries(Object.entries(initialConfig.aliases ?? {}).map(([key, value]) => [key, path.resolve(root, value)]));
  const asImport = (file) => `/@fs/${normalizePath(file)}`;
  const clientEntry = asImport(path.join(runtimeRoot, 'client/main.ts'));
  const resumeEntry = asImport(path.join(runtimeRoot, 'client/resume.ts'));

  // Support project style languages when preprocessing is configured only in the app's Vite setup.
  const svelteConfig = await loadSvelteConfig({ root });
  const svelteOptions = svelteConfig?.preprocess == null ? { preprocess: vitePreprocess() } : {};

  // Share one evaluation across the gallery and its frames until a config input changes.
  const configFiles = configNames.map((name) => normalizePath(path.join(root, name)));
  let configDependencies = initial.dependencies;
  let watchedConfigFiles = new Set([...configFiles, ...configDependencies.map(normalizePath)]);
  let cachedConfig = Promise.resolve(initialConfig);
  let previewServer;

  // Keep a paused preview stopped across page refreshes and component switches in this session.
  let recentReloads = [];
  let paused = false;
  let lastTheme = initialConfig.theme;

  function getConfig() {
    // Coalesce concurrent requests after an edit and keep the newest load if another edit arrives.
    if (cachedConfig) return cachedConfig;
    const pending = readConfig(root, effectiveMode).then(({ config, dependencies }) => {
      if (cachedConfig === pending) {
        configDependencies = dependencies;
        lastTheme = config.theme;
        watchedConfigFiles = new Set([...configFiles, ...dependencies.map(normalizePath)]);
        previewServer.watcher.add(dependencies);
      }
      return config;
    }).catch((error) => {
      if (cachedConfig === pending) cachedConfig = undefined;
      throw error;
    });
    cachedConfig = pending;
    return pending;
  }

  const previewPlugin = {
    name: 'svelte-component-previews',
    resolveId(id) {
      // Explicit project aliases take precedence; only opt-in Kit imports reach these virtual modules.
      if (initialConfig.sveltekit && kitModules.has(id)) return '\0' + kitPrefix + kitModules.get(id);
      if (id.startsWith(kitPrefix)) return '\0' + id;
      if (id.startsWith(prefix)) return '\0' + id;
    },
    async load(id) {
      // Share one static page object across the state and navigation shims inside each document.
      if (id.startsWith('\0' + kitPrefix)) {
        const module = id.slice(('\0' + kitPrefix).length);
        if (module === 'environment') return 'export const browser = true, dev = true, building = false, prerendering = false, version = "";';
        if (module === 'navigation') return `export { goto } from ${JSON.stringify(kitPrefix + 'state')};`;
        if (module === 'state') {
          const config = await getConfig();
          return `import { createSvelteKitState } from ${JSON.stringify(asImport(path.join(runtimeRoot, 'sveltekit.mjs')))};
const kit = createSvelteKitState();
const defaults = ${JSON.stringify(config.sveltekit?.page ?? {})};
export const { page, navigating, updated, goto } = kit;
export const configurePage = (page) => kit.configurePage(defaults, page);
configurePage();`;
        }
        return;
      }
      if (!id.startsWith('\0' + prefix)) return;

      // Generate static imports so Vite can track fixture and component dependencies for live updates.
      const url = new URL(id.slice(1), 'http://preview.local');
      const target = await resolveComponent(root, url.searchParams.get('file'));
      const config = await getConfig();
      if (!target.preview) {
        return `import { showMissingPreview } from ${JSON.stringify(clientEntry)};\nshowMissingPreview(${JSON.stringify(target.relative)});`;
      }
      if (url.pathname.endsWith('/gallery')) {
        return `import { showGallery } from ${JSON.stringify(clientEntry)};\nshowGallery();`;
      }
      const styles = url.pathname.endsWith('/frame') ? config.styles.map((style) => `import ${JSON.stringify(asImport(style))};`).join('\n') : '';

      // Inline self-contained hooks or import their module without including the server config in frames.
      const setup = typeof config.setup === 'function' ? `const setup = ${inlineSetupExpression(config.setup)};`
        : config.setup ? `const { default: setup } = await import(${JSON.stringify(asImport(config.setup))});` : 'const setup = undefined;';

      // Project fixtures initialize before imports; state overrides apply before setup and component mounting.
      const kitImport = initialConfig.sveltekit ? `import { configurePage } from ${JSON.stringify(kitPrefix + 'state')};` : '';
      const kitSetup = initialConfig.sveltekit
        ? 'configurePage(definition.states[new URLSearchParams(location.search).get("state")]?.sveltekit?.page);'
        : 'if (Object.values(definition.states).some(state => state.sveltekit !== undefined)) throw new Error("Enable sveltekit in svelte-preview.config to use page fixtures.");';
      return `${styles}\nimport { boot, reportError } from ${JSON.stringify(clientEntry)};\n${kitImport}\ntry { ${setup} const { default: definition } = await import(${JSON.stringify(asImport(target.preview))}); ${kitSetup} boot(definition, ${JSON.stringify(config.viewport)}, setup); } catch (error) { reportError(error); }`;
    },
    watchChange(file) {
      // A manual refresh must see config edits even when HMR is disabled by a project plugin.
      if (this.environment.name === 'client' && watchedConfigFiles.has(file)) {
        cachedConfig = undefined;
        if (!paused) previewServer.moduleGraph.invalidateAll();
      }
    },
    hotUpdate({ file, modules, server, type }) {
      // Reload once for config edits, preview discovery changes, and files used by the preview.
      if (this.environment.name !== 'client') return;
      const configChanged = watchedConfigFiles.has(file);
      const discoveryChanged = type !== 'update' && /(?:\.svelte|\.preview\.[jt]s)$/.test(file);
      if (!configChanged && !discoveryChanged && !modules.length) return;
      if (paused) return [];

      // Let the last reload open the pause screen without recompiling the component.
      const now = performance.now();
      recentReloads = recentReloads.filter((time) => now - time < reloadWindowMs);
      recentReloads.push(now);
      paused = recentReloads.length >= reloadLimit;
      if (!paused && !configChanged) server.moduleGraph.invalidateAll();
      this.environment.hot.send({ type: 'full-reload' });
      return [];
    },
    configureServer(server) {
      // Vite already watches the package root; imported config files can live in a parent workspace.
      previewServer = server;
      server.watcher.add(configDependencies);

      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://preview.local');
        try {
          // Require a same-origin POST for actions initiated by the preview UI.
          if (url.pathname === '/__preview/create' || url.pathname === '/__preview/resume') {
            const resuming = url.pathname === '/__preview/resume';
            if (request.method !== 'POST') {
              response.statusCode = 405;
              response.setHeader('Allow', 'POST');
              response.end(resuming ? 'Use POST to resume the preview.' : 'Use POST to create a preview.');
              return;
            }
            if (request.headers.origin !== new URL(server.resolvedUrls.local[0]).origin
              || request.headers['x-svelte-preview'] !== (resuming ? 'resume' : 'create')) {
              response.statusCode = 403;
              response.end(resuming ? 'Resume from the preview panel.' : 'Create previews from the preview panel.');
              return;
            }

            // Rebuild once on resume so the next request sees all edits made while paused.
            if (resuming) {
              if (paused) {
                server.moduleGraph.invalidateAll();
                recentReloads = [];
                paused = false;
              }
              response.statusCode = 204;
              response.end();
              return;
            }

            // Reuse existing definitions and never overwrite a file created by another action.
            const target = await resolveComponent(root, url.searchParams.get('file'));
            const preview = target.preview ?? target.component.slice(0, -7) + '.preview.ts';
            if (!target.preview) {
              const importPath = JSON.stringify('./' + path.basename(target.component));
              const text = `import Component from ${importPath};\nimport { definePreviews } from 'svelte-preview';\n\nexport default definePreviews(Component, {\n  Default: {\n    // Supply this component's required props here.\n    props: {}\n  }\n});\n`;
              try {
                await writeFile(preview, text, { flag: 'wx' });
              } catch (error) {
                if (error.code !== 'EEXIST') throw error;
              }
            }
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify({ file: normalizePath(path.relative(root, preview)) }));
            return;
          }

          // Expose a tiny discovery endpoint for browser use and the IDE's empty state.
          if (url.pathname === '/__preview/components') {
            response.setHeader('Content-Type', 'application/json');
            response.end(JSON.stringify(await listComponents(root)));
            return;
          }

          // Keep the same origin for the gallery and frames; only frames import project CSS.
          if (url.pathname === '/' || url.pathname === '/__preview/frame') {
            // Let harnesses detect a paused preview without loading the component.
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            response.setHeader('Cache-Control', 'no-store');
            if (paused) {
              const html = documentHtml(resumeEntry, lastTheme, { content: pausedContent, status: 'paused' });
              response.end(await server.transformIndexHtml(url.pathname, html));
              return;
            }

            // Resolve the component and its theme only for active previews.
            let previewEntry;
            if (url.searchParams.has('file')) {
              await resolveComponent(root, url.searchParams.get('file'));
              const kind = url.pathname.endsWith('/frame') ? 'frame' : 'gallery';
              previewEntry = `${prefix}${kind}?file=${encodeURIComponent(url.searchParams.get('file'))}`;
            }
            const config = await getConfig();
            const html = documentHtml(clientEntry, config.theme, { previewEntry });
            response.end(await server.transformIndexHtml(url.pathname, html));
            return;
          }
          next();
        } catch (error) {
          // Render failures as text rather than allowing filenames or compiler errors to inject markup.
          response.statusCode = 400;
          response.setHeader('Content-Type', 'text/plain; charset=utf-8');
          response.end(error instanceof Error ? error.message : String(error));
        }
      });
    }
  };

  // Keep the preview optimizer cache separate from the application's Vite server.
  const server = await createServer({
    root,
    cacheDir: 'node_modules/.vite-svelte-preview',
    configFile: false,
    mode: effectiveMode,
    define: initialConfig.define,
    appType: 'custom',
    clearScreen: false,
    plugins: [previewPlugin, svelte(svelteOptions), ...(initialConfig.plugins ?? [])],
    resolve: { alias: { $lib: path.join(root, 'src/lib'), ...aliases }, dedupe: ['svelte'] },
    // Bind to loopback and let the OS choose a free port when launched by the IDE.
    server: { host: '127.0.0.1', port, strictPort: port !== 0, cors: false, fs: { allow: [root, runtimeRoot] } }
  });
  await server.listen();
  return server;
}
