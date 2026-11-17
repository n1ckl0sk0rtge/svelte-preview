import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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
