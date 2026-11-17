import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { definePreviews } from '../index.mjs';
import { startPreviewServer } from '../server.mjs';
import { createSvelteKitState } from '../sveltekit.mjs';

test('page fixtures merge by field and remain independent of definitions and other frames', () => {
  // Model two frame documents initialized from the same project and state fixtures.
  const defaults = { url: '/projects', route: { id: '/projects/[id]' }, data: { title: 'Project' }, params: { id: 'default' } };
  const overrides = { url: '/projects/42?tab=assets', params: { id: '42' }, state: { selected: true } };
  const first = createSvelteKitState();
  const second = createSvelteKitState();
  const page = first.page;
  first.configurePage(defaults, overrides);
  second.configurePage(defaults, { url: '/projects/99', params: { id: '99' } });

  // A state replaces complete fields while preserving unspecified project defaults and object identity.
  assert.equal(first.page, page);
  assert.equal(page.url.href, 'http://preview.local/projects/42?tab=assets');
  assert.deepEqual(page.route, { id: '/projects/[id]' });
  assert.deepEqual(page.params, { id: '42' });
  assert.deepEqual(page.state, { selected: true });
  assert.equal(page.status, 200);
  assert.equal(page.error, null);
  assert.equal(page.form, null);

  // Component mutation must not change shared fixtures or another frame's page values.
  page.data.title = 'Changed';
  page.params.id = 'changed';
  page.url.pathname = '/changed';
  assert.equal(defaults.data.title, 'Project');
  assert.equal(overrides.params.id, '42');
  assert.equal(second.page.data.title, 'Project');
  assert.equal(second.page.url.pathname, '/projects/99');
  first.configurePage(defaults);
  assert.deepEqual(page.state, {});
  assert.equal(page.data.title, 'Project');
});

test('navigation reports its destination without changing the static page', async t => {
  // Resolve relative destinations using the fixture URL instead of the preview server's frame URL.
  const info = t.mock.method(console, 'info', () => {});
  const kit = createSvelteKitState();
  kit.configurePage({ url: 'https://example.test/projects/42' });
  await kit.goto('../99', { replaceState: true });
  assert.deepEqual(info.mock.calls[0].arguments, ['[svelte-preview] goto()', 'https://example.test/99', { replaceState: true }]);
  assert.equal(kit.page.url.href, 'https://example.test/projects/42');
  assert.equal(kit.navigating.to, null);
  assert.equal(kit.updated.current, false);
  assert.equal(await kit.updated.check(), false);
});

test('state definitions validate SvelteKit fixtures', () => {
  // Preserve valid fixtures and reject shapes that would silently discard state overrides.
  const sveltekit = { page: { url: '/projects/42' } };
  assert.equal(definePreviews(() => {}, { Default: { props: {}, sveltekit } }).states.Default.sveltekit, sveltekit);
  for (const invalid of [true, null, [], { page: false }, { page: [] }]) {
    assert.throws(() => definePreviews(() => {}, { Default: { props: {}, sveltekit: invalid } }), /sveltekit must be/);
  }
});

async function createProject(config) {
  // Keep Vite's dependency cache local to this fixture so concurrent preview servers cannot replace it.
  const root = await mkdtemp(path.join(os.tmpdir(), 'svelte-preview-kit-'));
  await mkdir(path.join(root, 'node_modules'));
  await symlink(fileURLToPath(new URL('../node_modules/svelte', import.meta.url)), path.join(root, 'node_modules/svelte'));

  // Keep the SvelteKit application imports real while replacing only the modules promised by the shims.
  await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await writeFile(path.join(root, 'svelte-preview.config.mjs'), config);
  await writeFile(path.join(root, 'Card.svelte'), '<p>Card</p>');
  await writeFile(path.join(root, 'Card.preview.js'), 'export default {};');
  await writeFile(path.join(root, 'kit.js'), `export { browser, dev, building } from '$app/environment';
export { browser as legacyBrowser } from '$app/env';
export { page, navigating, updated } from '$app/state';
export { goto } from '$app/navigation';`);
  return root;
}

test('opt-in virtual modules share configured page fixtures and initialize before preview imports', async t => {
  // Compile the public imports through Vite to catch resolution and shared-module identity mistakes.
  const root = await createProject(`export default { sveltekit: { page: {
    url: '/projects/42', route: { id: '/projects/[id]' }, params: { id: '42' }, data: { title: 'Project' }
  } } };`);
  let server;
  t.after(async () => {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  });
  server = await startPreviewServer({ root });
  await server.watcher.close();
  const kit = await server.ssrLoadModule('/kit.js');
  assert.equal(kit.browser, true);
  assert.equal(kit.legacyBrowser, true);
  assert.equal(kit.dev, true);
  assert.equal(kit.building, false);
  assert.equal(kit.page.url.pathname, '/projects/42');
  assert.equal(kit.page.params.id, '42');
  assert.equal(kit.page.data.title, 'Project');
  const state = await server.ssrLoadModule('virtual:svelte-preview/sveltekit/state');
  assert.equal(state.page, kit.page);
  state.configurePage({ params: { id: '99' } });
  assert.equal(kit.page.params.id, '99');
  assert.equal(kit.page.data.title, 'Project');

  // Generated frames import defaults before the definition and select state overrides before boot.
  const frame = await server.transformRequest('/@svelte-preview/frame?file=Card.svelte');
  const gallery = await server.transformRequest('/@svelte-preview/gallery?file=Card.svelte');
  assert.match(frame.code, /import .*configurePage/);
  assert.match(frame.code, /configurePage\(definition\.states\[/);
  assert.ok(frame.code.indexOf('configurePage(definition') < frame.code.indexOf('boot(definition'));
  assert.doesNotMatch(gallery.code, /sveltekit|configurePage/);
});

test('SvelteKit shims are disabled by default and explicit aliases take precedence', async t => {
  // A regular Svelte project must retain normal unresolved-import behavior unless it opts in.
  const root = await createProject('export default {};');
  let server;
  t.after(async () => {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  });
  server = await startPreviewServer({ root });
  await server.watcher.close();
  assert.equal(await server.pluginContainer.resolveId('$app/state'), null);
  const frame = await server.transformRequest('/@svelte-preview/frame?file=Card.svelte');
  assert.match(frame.code, /Enable sveltekit/);
  await server.close();

  // Existing custom aliases keep working even when the built-in shims are enabled.
  await writeFile(path.join(root, 'custom-state.js'), 'export const page = { custom: true };');
  await writeFile(path.join(root, 'svelte-preview.config.mjs'), `export default {
    sveltekit: true, aliases: { '$app/state': './custom-state.js' }
  };`);
  server = await startPreviewServer({ root });
  await server.watcher.close();
  const kit = await server.ssrLoadModule('/kit.js');
  assert.equal(kit.page.custom, true);
});
