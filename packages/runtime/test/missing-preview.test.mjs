import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { resolveComponent, startPreviewServer } from '../server.mjs';

test('missing previews have a themed empty state and explicit creation never overwrites definitions', async t => {
  // Isolate file creation from the checked-in demo, with no preview config present.
  const directory = await mkdtemp(path.join(os.tmpdir(), 'svelte-preview-create-'));
  const root = path.join(directory, 'project');
  const components = path.join(root, 'src/lib');
  await mkdir(components, { recursive: true });
  await symlink(fileURLToPath(new URL('../../../examples/demo/node_modules', import.meta.url)), path.join(root, 'node_modules'));
  await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await writeFile(path.join(components, 'Welcome Card.svelte'), '<h1>Welcome</h1>');
  const server = await startPreviewServer({ root });
  t.after(async () => {
    await server.close();
    await rm(directory, { recursive: true, force: true });
  });
  const base = server.resolvedUrls.local[0];
  const file = 'src/lib/Welcome Card.svelte';
  const preview = path.join(components, 'Welcome Card.preview.ts');
  const createUrl = new URL(`/__preview/create?${new URLSearchParams({ file })}`, base);
  const headers = { Origin: new URL(base).origin, 'X-Svelte-Preview': 'create' };

  // A missing definition is a normal HTML view, discoverable before anything is written.
  assert.equal((await resolveComponent(root, file)).preview, null);
  assert.deepEqual(await (await fetch(new URL('/__preview/components', base))).json(), [file]);
  for (const ideTheme of ['light', 'dark']) {
    const response = await fetch(new URL(`/?${new URLSearchParams({ file, ideTheme })}`, base));
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(await response.text(), /data-preview-theme="auto"/);
  }
  const empty = await server.transformRequest(`/@svelte-preview/gallery?${new URLSearchParams({ file })}`);
  assert.match(empty.code, /showMissingPreview/);
  await assert.rejects(readFile(preview), { code: 'ENOENT' });

  // Only deliberate same-origin POSTs can create files, and paths must stay inside the project.
  assert.equal((await fetch(createUrl)).status, 405);
  assert.equal((await fetch(createUrl, { method: 'POST' })).status, 403);
  assert.equal((await fetch(createUrl, { method: 'POST', headers: { ...headers, Origin: 'https://other.example' } })).status, 403);
  const outside = new URL(`/__preview/create?${new URLSearchParams({ file: '../Outside.svelte' })}`, base);
  const outsideComponent = path.join(path.dirname(root), 'Outside.svelte');
  await writeFile(outsideComponent, '<p>Outside</p>');
  assert.equal((await fetch(outside, { method: 'POST', headers })).status, 400);
  const outsidePreview = outsideComponent.replace(/\.svelte$/, '.preview.ts');
  await assert.rejects(readFile(outsidePreview), { code: 'ENOENT' });

  // The generated state compiles and subsequent clicks preserve user edits.
  const created = await fetch(createUrl, { method: 'POST', headers });
  assert.equal(created.status, 200);
  assert.deepEqual(await created.json(), { file: 'src/lib/Welcome Card.preview.ts' });
  const text = await readFile(preview, 'utf8');
  assert.match(text, /import Component from "\.\/Welcome Card\.svelte"/);
  assert.match(text, /Default:[\s\S]*props: \{\}/);
  const definition = await server.transformRequest('/src/lib/Welcome Card.preview.ts');
  assert.match(definition.code, /definePreviews/);
  const edited = text + '\n// Keep my custom states.\n';
  await writeFile(preview, edited);
  assert.equal((await fetch(createUrl, { method: 'POST', headers })).status, 200);
  assert.equal(await readFile(preview, 'utf8'), edited);

  // JavaScript definitions are also reused instead of creating a competing TypeScript file.
  await rm(preview);
  const javascript = preview.replace(/\.ts$/, '.js');
  await writeFile(javascript, 'export default {};\n');
  const existing = await fetch(createUrl, { method: 'POST', headers });
  assert.deepEqual(await existing.json(), { file: 'src/lib/Welcome Card.preview.js' });
  assert.equal(await readFile(javascript, 'utf8'), 'export default {};\n');
  await assert.rejects(readFile(preview), { code: 'ENOENT' });
});
