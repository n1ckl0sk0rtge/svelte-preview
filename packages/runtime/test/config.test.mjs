import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { startPreviewServer } from '../server.mjs';

async function createProject(config) {
  // Keep Vite's dependency cache local to this fixture so concurrent preview servers cannot replace it.
  const root = await mkdtemp(path.join(os.tmpdir(), 'svelte-preview-config-'));
  await mkdir(path.join(root, 'node_modules'));
  await symlink(fileURLToPath(new URL('../node_modules/svelte', import.meta.url)), path.join(root, 'node_modules/svelte'));
  await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await writeFile(path.join(root, 'svelte-preview.config.mjs'), config);
  return root;
}

for (const { name, config, mode, expectedMode, expectedBase } of [
  { name: 'default preview environment', config: 'export default {};', expectedMode: 'preview', expectedBase: '/preview' },
  { name: 'configured development environment', config: 'export default { mode: "development" };', expectedMode: 'development', expectedBase: '/development' },
  { name: 'CLI mode overrides the configured mode', config: 'export default { mode: "development" };', mode: 'staging', expectedMode: 'staging', expectedBase: '/staging' },
  {
    name: 'explicit constants override environment values',
    config: `export default ({ mode }) => ({ mode: 'development', define: {
      'import.meta.env.VITE_PREVIEW_TEST_API_BASE': JSON.stringify(''),
      __CONFIG_MODE__: JSON.stringify(mode)
    } });`,
    expectedMode: 'development', expectedBase: ''
  }
]) {
  test(name, async t => {
    // Make each mode produce a different request base to detect accidental environment fallback.
    const root = await createProject(config);
    let server;
    t.after(async () => {
      await server?.close();
      await rm(root, { recursive: true, force: true });
    });
    for (const environment of ['preview', 'development', 'staging']) {
      await writeFile(path.join(root, `.env.${environment}`), `VITE_PREVIEW_TEST_API_BASE=/${environment}\n`);
    }
    await writeFile(path.join(root, 'environment.js'), `export const mode = import.meta.env.MODE;
export const base = import.meta.env.VITE_PREVIEW_TEST_API_BASE;
export const configMode = typeof __CONFIG_MODE__ === 'undefined' ? null : __CONFIG_MODE__;`);

    // Evaluate the client transform so assertions cover what application requests actually receive.
    server = await startPreviewServer({ root, mode });
    await server.watcher.close();
    const transformed = await server.transformRequest('/environment.js');
    const environment = await import(`data:text/javascript;base64,${Buffer.from(transformed.code).toString('base64')}`);
    assert.equal(environment.mode, expectedMode);
    assert.equal(environment.base, expectedBase);
    if (environment.configMode) assert.equal(environment.configMode, expectedMode);
  });
}

test('gallery and frames reuse preview config until a config dependency changes', async t => {
  // Count evaluations without creating changes in the files Vite watches.
  const root = await createProject(`
    import { appendFileSync } from 'node:fs';
    import { theme } from './theme.mjs';
    appendFileSync(new URL('./node_modules/config-loads', import.meta.url), 'loaded ');
    export default { theme };
  `);
  let server;
  t.after(async () => {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  });
  const themeFile = path.join(root, 'theme.mjs');
  const loadsFile = path.join(root, 'node_modules/config-loads');
  await writeFile(themeFile, `export const theme = 'light';`);
  await writeFile(path.join(root, 'Card.svelte'), '<p>Card</p>');
  await writeFile(path.join(root, 'Card.preview.js'), 'export default {};');
  server = await startPreviewServer({ root });

  // Drive the same concurrent document and module requests made by the embedded browser.
  const galleryUrl = new URL('?file=Card.svelte', server.resolvedUrls.local[0]);
  const frameUrl = new URL('/__preview/frame?file=Card.svelte', galleryUrl);
  const readTheme = async url => (await (await fetch(url)).text()).match(/data-preview-theme="([^"]+)"/)?.[1];
  const [galleryTheme, frameTheme] = await Promise.all([
    readTheme(galleryUrl), readTheme(frameUrl), server.transformRequest('/@svelte-preview/frame?file=Card.svelte')
  ]);
  assert.equal(galleryTheme, 'light');
  assert.equal(frameTheme, 'light');
  assert.equal(await readFile(loadsFile, 'utf8'), 'loaded ');

  // Hot updates to imported settings should reach an open preview without restarting Vite.
  await writeFile(themeFile, `export const theme = 'dark';`);
  let updatedTheme = await readTheme(galleryUrl);
  for (let attempt = 0; updatedTheme !== 'dark' && attempt < 100; attempt++) {
    await setTimeout(20);
    updatedTheme = await readTheme(galleryUrl);
  }
  assert.equal(updatedTheme, 'dark');
  assert.equal(await readFile(loadsFile, 'utf8'), 'loaded loaded ');
});

test('rapid automatic reloads pause the preview until the user resumes', async t => {
  // Start with a component that Vite has already compiled and can track for live updates.
  const root = await createProject('export default { theme: "dark" };');
  let server;
  let socket;
  t.after(async () => {
    socket?.close();
    await server?.close();
    await rm(root, { recursive: true, force: true });
  });
  const component = path.join(root, 'Card.svelte');
  const edit = (version) => writeFile(component, `<p>Version ${version}</p>`);
  await edit(0);
  await writeFile(path.join(root, 'Card.preview.js'), 'export default {};');
  server = await startPreviewServer({ root });
  await server.transformRequest('/Card.svelte');
  const base = new URL(server.resolvedUrls.local[0]);
  const gallery = new URL('?file=Card.svelte', base);
  const frame = new URL('/__preview/frame?file=Card.svelte', base);
  const document = async (url) => (await fetch(url)).text();

  // Observe the same reload messages delivered to the browser instead of relying on fixed delays.
  const websocket = new URL(base);
  websocket.protocol = 'ws:';
  websocket.searchParams.set('token', server.config.webSocketToken);
  socket = new WebSocket(websocket, 'vite-hmr');
  await once(socket, 'open', { signal: AbortSignal.timeout(5_000) });

  async function editAndWait(version) {
    // Give the watcher time to distinguish successive saves of the same file on Linux.
    await setTimeout(100);

    // Listen before writing the file and ignore messages unrelated to a full reload.
    const signal = AbortSignal.timeout(5_000);
    const reload = new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error(`No reload for version ${version}`, { cause: signal.reason })), { once: true });
      const receive = (event) => {
        if (JSON.parse(event.data).type !== 'full-reload') return;
        socket.removeEventListener('message', receive);
        resolve();
      };
      socket.addEventListener('message', receive, { signal });
    });
    await Promise.all([edit(version), reload]);
  }

  // The fifth reload shows a lightweight page for both the gallery and the frames.
  for (let version = 1; version <= 5; version++) {
    await editAndWait(version);
    const html = await document(gallery);
    if (version < 5) assert.match(html, /@svelte-preview\/gallery/);
    else assert.match(html, /Preview paused/);
  }
  const pausedFrame = await document(frame);
  assert.match(pausedFrame, /Resume preview/);
  assert.match(pausedFrame, /data-preview-theme="dark"/);
  assert.doesNotMatch(pausedFrame, /@svelte-preview\/frame/);

  // Edits and ordinary refreshes leave the pause in place until the explicit resume action.
  await edit(6);
  assert.match(await document(gallery), /Preview paused/);
  const resume = new URL('/__preview/resume', base);
  assert.equal((await fetch(resume)).status, 405);
  assert.equal((await fetch(resume, { method: 'POST' })).status, 403);
  assert.match(await document(gallery), /Preview paused/);
  assert.equal((await fetch(resume, {
    method: 'POST', headers: { Origin: base.origin, 'X-Svelte-Preview': 'resume' }
  })).status, 204);
  assert.match(await document(gallery), /@svelte-preview\/gallery/);
  assert.match((await server.transformRequest('/Card.svelte')).code, /Version 6/);

  // Resuming starts a fresh reload window and restores ordinary live updates.
  await editAndWait(7);
  assert.match(await document(gallery), /@svelte-preview\/gallery/);
});

test('invalid modes and SvelteKit options fail before starting a server', async t => {
  // Fail configuration mistakes early, including Vite's reserved local mode.
  const root = await createProject('export default {};');
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const mode of ['', ' ', 'local', 42]) {
    await assert.rejects(startPreviewServer({ root, mode }), /Preview mode must be/);
  }
  for (const config of [
    '{ mode: "" }', '{ mode: "local" }', '{ sveltekit: "yes" }',
    '{ sveltekit: [] }', '{ sveltekit: { page: null } }', '{ sveltekit: { page: [] } }'
  ]) {
    await writeFile(path.join(root, 'svelte-preview.config.mjs'), `export default ${config};`);
    await assert.rejects(startPreviewServer({ root }), /Preview (mode|sveltekit)/);
  }
});
