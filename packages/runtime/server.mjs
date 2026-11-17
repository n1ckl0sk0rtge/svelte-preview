import { existsSync, realpathSync } from 'node:fs';
import { access, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, loadConfigFromFile, normalizePath } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { validateViewport } from './index.mjs';

const runtimeRoot = fileURLToPath(new URL('.', import.meta.url));
const prefix = '/@svelte-preview/';
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

async function readConfig(root) {
  // Load a dedicated config so previewing a component never starts the application's server hooks.
  const file = ['svelte-preview.config.ts', 'svelte-preview.config.js', 'svelte-preview.config.mjs']
    .map((name) => path.join(root, name)).find(existsSync);
  const result = file ? await loadConfigFromFile({ command: 'serve', mode: 'preview' }, file, root, 'silent') : null;
  const config = result?.config ?? {};
  const viewport = config.viewport ?? { width: 360, height: 340 };
  validateViewport(viewport);
  const theme = config.theme ?? 'auto';
  if (!['auto', 'light', 'dark'].includes(theme)) throw new Error('Preview theme must be auto, light, or dark.');

  // Validate CSS imports before Vite compiles the preview entry.
  const styles = (config.styles ?? []).map((style) => path.resolve(root, style));
  for (const style of styles) await access(style);
  return { ...config, viewport, styles, theme };
}

function documentHtml(entry, theme) {
  // Pass the validated theme to every document, including the standalone component list.
  return `<!doctype html><html lang="en" data-preview-theme="${theme}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Svelte Preview</title></head><body><div id="app"></div><script type="module" src="${entry}"></script></body></html>`;
}

export async function startPreviewServer({ root = process.cwd(), port = 0 } = {}) {
  // Reuse the project's Svelte configuration and aliases without booting SvelteKit routing.
  root = realpathSync(root);
  const initialConfig = await readConfig(root);
  const aliases = Object.fromEntries(Object.entries(initialConfig.aliases ?? {}).map(([key, value]) => [key, path.resolve(root, value)]));
  const asImport = (file) => `/@fs/${normalizePath(file)}`;
  const clientEntry = asImport(path.join(runtimeRoot, 'client/main.ts'));

  const previewPlugin = {
    name: 'svelte-component-previews',
    resolveId(id) {
      if (id.startsWith(prefix)) return '\0' + id;
    },
    async load(id) {
      if (!id.startsWith('\0' + prefix)) return;

      // Generate static imports so Vite can track fixture and component dependencies for live updates.
      const url = new URL(id.slice(1), 'http://preview.local');
      const target = await resolveComponent(root, url.searchParams.get('file'));
      const config = await readConfig(root);
      if (!target.preview) {
        return `import { showMissingPreview } from ${JSON.stringify(clientEntry)};\nshowMissingPreview(${JSON.stringify(target.relative)});`;
      }
      if (url.pathname.endsWith('/gallery')) {
        return `import { showGallery } from ${JSON.stringify(clientEntry)};\nshowGallery();`;
      }
      const styles = url.pathname.endsWith('/frame') ? config.styles.map((style) => `import ${JSON.stringify(asImport(style))};`).join('\n') : '';
      return `${styles}\nimport { boot, reportError } from ${JSON.stringify(clientEntry)};\ntry { const { default: definition } = await import(${JSON.stringify(asImport(target.preview))}); boot(definition, ${JSON.stringify(config.viewport)}); } catch (error) { reportError(error); }`;
    },
    handleHotUpdate(context) {
      // A full reset keeps all state cards deterministic after component, fixture, or CSS edits.
      if (!context.file.includes('/node_modules/')) {
        context.server.moduleGraph.invalidateAll();
        context.server.ws.send({ type: 'full-reload' });
        return [];
      }
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://preview.local');
        try {
          // Require an explicit same-origin request before writing a neighboring preview file.
          if (url.pathname === '/__preview/create') {
            if (request.method !== 'POST') {
              response.statusCode = 405;
              response.setHeader('Allow', 'POST');
              response.end('Use POST to create a preview.');
              return;
            }
            if (request.headers.origin !== new URL(server.resolvedUrls.local[0]).origin
              || request.headers['x-svelte-preview'] !== 'create') {
              response.statusCode = 403;
              response.end('Create previews from the preview panel.');
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
            let entry = clientEntry;
            if (url.searchParams.has('file')) {
              await resolveComponent(root, url.searchParams.get('file'));
              const kind = url.pathname.endsWith('/frame') ? 'frame' : 'gallery';
              entry = `${prefix}${kind}?file=${encodeURIComponent(url.searchParams.get('file'))}`;
            }
            response.setHeader('Content-Type', 'text/html; charset=utf-8');
            response.setHeader('Cache-Control', 'no-store');
            const config = await readConfig(root);
            response.end(await server.transformIndexHtml(url.pathname, documentHtml(entry, config.theme)));
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

      // Preview creation and deletion must also refresh a currently open gallery.
      const refresh = () => {
        server.moduleGraph.invalidateAll();
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', refresh);
      server.watcher.on('unlink', refresh);
    }
  };

  // Bind to loopback and let the OS choose a free port when launched by the IDE.
  const server = await createServer({
    root,
    configFile: false,
    mode: 'preview',
    appType: 'custom',
    clearScreen: false,
    plugins: [previewPlugin, svelte()],
    resolve: { alias: { $lib: path.join(root, 'src/lib'), ...aliases }, dedupe: ['svelte'] },
    server: { host: '127.0.0.1', port, strictPort: port !== 0, cors: false, fs: { allow: [root, runtimeRoot] } }
  });
  await server.listen();
  return server;
}
