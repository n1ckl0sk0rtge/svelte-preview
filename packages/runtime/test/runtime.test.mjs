import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { definePreviews, validateViewport } from '../index.mjs';
import { resolveComponent, startPreviewServer } from '../server.mjs';

test('preview definitions preserve callback props and reject invalid states', () => {
  const callback = () => {};
  const definition = definePreviews(() => {}, { Default: { props: { onclick: callback } } });
  assert.equal(definition.states.Default.props.onclick, callback);
  assert.throws(() => definePreviews(() => {}, {}), /at least one/);
  assert.throws(() => definePreviews(() => {}, { Default: {} }), /props object/);
  assert.throws(() => definePreviews(() => {}, { Default: { props: {}, viewport: { width: -1, height: 340 } } }), /viewport/);
  assert.throws(() => validateViewport({ width: Infinity, height: 340 }), /viewport/);

  // Automatic sizing is valid for individual states as well as the project default.
  assert.equal(definePreviews(() => {}, { Default: { props: {}, viewport: 'auto' } }).states.Default.viewport, 'auto');
  assert.doesNotThrow(() => validateViewport('auto'));
  assert.throws(() => validateViewport('full'), /viewport/);
});

test('setup hooks are preserved without execution and invalid hooks are rejected', () => {
  // Definition discovery must not create repositories or run component initialization hooks.
  let calls = 0;
  const setup = () => { calls += 1; };
  const definition = definePreviews(() => {}, { Loaded: { props: {}, setup } });
  assert.equal(definition.states.Loaded.setup, setup);
  assert.equal(calls, 0);

  // Reject invalid setup before a frame attempts to mount its component tree.
  assert.throws(() => definePreviews(() => {}, { Invalid: { props: {}, setup: {} } }), /setup must be a function/);
  assert.throws(() => definePreviews(() => {}, { Invalid: { props: {}, setup: async () => {} } }), /setup must be synchronous/);
});

test('component resolution handles spaced filenames and rejects traversal and symlinks', async () => {
  // Make independent roots so path containment is tested against real filesystem paths.
  const directory = await mkdtemp(path.join(os.tmpdir(), 'svelte-preview-'));
  const root = path.join(directory, 'project');
  await mkdir(root);
  await writeFile(path.join(root, 'My Card.svelte'), '<p>Card</p>');
  await writeFile(path.join(root, 'My Card.preview.ts'), 'export default {}');
  await writeFile(path.join(directory, 'Outside.svelte'), '<p>Outside</p>');
  await symlink(path.join(directory, 'Outside.svelte'), path.join(root, 'Escape.svelte'));
  try {
    const target = await resolveComponent(root, 'My Card.svelte');
    assert.equal(target.relative, 'My Card.svelte');
    assert.ok(target.preview.endsWith('My Card.preview.ts'));
    await assert.rejects(resolveComponent(root, '../Outside.svelte'), /inside/);
    await assert.rejects(resolveComponent(root, 'Escape.svelte'), /inside/);
    await assert.rejects(resolveComponent(root, 'secret.txt'), /\.svelte/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('standalone server discovers the demo component and compiles its previews', async () => {
  // Exercise the same HTML and module endpoints consumed by JCEF instead of mocking Vite.
  const root = fileURLToPath(new URL('../../../examples/demo', import.meta.url));
  const server = await startPreviewServer({ root });
  const base = server.resolvedUrls.local[0];
  try {
    const discovery = await fetch(new URL('__preview/components', base));
    assert.deepEqual(await discovery.json(), ['src/lib/ServicesTable.svelte']);
    const page = await fetch(new URL('?file=src/lib/ServicesTable.svelte', base));
    assert.equal(page.status, 200);
    const galleryHtml = await page.text();
    assert.match(galleryHtml, /data-preview-status="loading"/);
    assert.match(galleryHtml, /data-preview-entry="\/@svelte-preview\/gallery\?file=src%2Flib%2FServicesTable\.svelte"/);

    // Start the browser client before fetching the preview module so load failures are observable.
    const framePage = await fetch(new URL('__preview/frame?file=src/lib/ServicesTable.svelte&state=Loaded', base));
    const frameHtml = await framePage.text();
    assert.match(frameHtml, /data-preview-status="loading"/);
    assert.match(frameHtml, /data-preview-entry="\/@svelte-preview\/frame\?file=src%2Flib%2FServicesTable\.svelte"/);
    assert.match(frameHtml, /<script type="module" src="[^"]+\/client\/main\.ts">/);

    // Every document receives the demo's dark theme, even when the IDE uses a light theme.
    for (const location of ['/', '?file=src/lib/ServicesTable.svelte&ideTheme=light', '__preview/frame?file=src/lib/ServicesTable.svelte&state=Loaded&ideTheme=light']) {
      const document = await fetch(new URL(location, base));
      assert.equal(document.status, 200);
      assert.match(await document.text(), /data-preview-theme="dark"/);
    }

    // The state frame imports the TypeScript definition and Carbon styles independently of the gallery.
    const compiled = await server.transformRequest('/@svelte-preview/frame?file=src/lib/ServicesTable.svelte');
    assert.match(compiled.code, /ServicesTable\.preview\.ts/);
    assert.match(compiled.code, /app\.css/);
    const gallery = await server.transformRequest('/@svelte-preview/gallery?file=src/lib/ServicesTable.svelte');
    assert.doesNotMatch(gallery.code, /ServicesTable\.preview\.ts|app\.css/);

    // Compile the setup wrapper and repository-backed table through the real Svelte/Vite pipeline.
    const wrapperPath = fileURLToPath(new URL('../client/PreviewRoot.svelte', import.meta.url));
    const wrapper = await server.transformRequest(`/@fs/${wrapperPath}`);
    assert.match(wrapper.code, /setup/);
    const component = await server.transformRequest('/src/lib/ServicesTable.svelte');
    assert.match(component.code, /DataTableSkeleton/);
    assert.match(component.code, /listServices/);

    const missing = await fetch(new URL('?file=Missing.svelte', base));
    assert.equal(missing.status, 400);
    assert.match(missing.headers.get('content-type'), /text\/plain/);
  } finally {
    await server.close();
  }
});

test('preview configuration validates and supplies explicit themes to every document', async () => {
  // Reuse installed dependencies while isolating configuration changes from the example project.
  const root = await mkdtemp(path.join(os.tmpdir(), 'svelte-preview-theme-'));
  const config = path.join(root, 'svelte-preview.config.mjs');
  await symlink(fileURLToPath(new URL('../../../node_modules', import.meta.url)), path.join(root, 'node_modules'));
  await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await writeFile(path.join(root, 'Card.svelte'), '<p>Card</p>');
  await writeFile(path.join(root, 'Card.preview.js'), 'export default {}');
  try {
    for (const theme of ['light', 'dark']) {
      await writeFile(config, `export default { theme: '${theme}' };`);
      const server = await startPreviewServer({ root });
      try {
        for (const location of ['/', '?file=Card.svelte&ideTheme=light', '__preview/frame?file=Card.svelte&state=Default&ideTheme=light']) {
          const response = await fetch(new URL(location, server.resolvedUrls.local[0]));
          assert.equal(response.status, 200);
          assert.match(await response.text(), new RegExp(`data-preview-theme="${theme}"`));
        }
      } finally {
        await server.close();
      }
    }

    // Invalid configuration must fail before any child server is started.
    await writeFile(config, "export default { theme: 'sepia' };");
    await assert.rejects(startPreviewServer({ root }), /theme must be auto, light, or dark/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('project setup is imported into frames without running during server configuration or gallery discovery', async t => {
  // Keep browser-only setup out of the server's config module and component discovery.
  const root = await mkdtemp(path.join(os.tmpdir(), 'svelte-preview-project-setup-'));
  let server;
  t.after(async () => {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  });
  await symlink(fileURLToPath(new URL('../../../examples/demo/node_modules', import.meta.url)), path.join(root, 'node_modules'));
  await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await writeFile(path.join(root, 'Card.svelte'), '<p>Card</p>');
  await writeFile(path.join(root, 'Card.preview.js'), 'export default {};');
  const config = path.join(root, 'svelte-preview.config.mjs');
  await writeFile(config, "export default { setup: './preview.setup.ts' };");
  await writeFile(path.join(root, 'preview.setup.ts'), `import type { PreviewSetup } from 'svelte-preview';
const setup: PreviewSetup = () => { document.documentElement.setAttribute('theme', 'g100'); };
export default setup;`);

  // The real Vite pipeline compiles the setup module and passes its export to the frame boot function.
  server = await startPreviewServer({ root });
  const frame = await server.transformRequest('/@svelte-preview/frame?file=Card.svelte');
  const gallery = await server.transformRequest('/@svelte-preview/gallery?file=Card.svelte');
  const setup = await server.transformRequest('/preview.setup.ts');
  assert.match(frame.code, /import\([^)]*preview\.setup\.ts/);
  assert.match(frame.code, /boot\(definition, [^;]*, setup\)/);
  assert.match(frame.code, /boot\(definition, "auto", setup\)/);
  assert.doesNotMatch(gallery.code, /preview\.setup|g100/);
  assert.match(setup.code, /document\.documentElement/);

  // Missing setup files fail before a new preview server is started.
  await server.close();
  server = undefined;
  await writeFile(config, "export default { setup: './missing.setup.ts' };");
  await assert.rejects(startPreviewServer({ root }), { code: 'ENOENT' });
});

for (const [name, declaration] of [
  ['method', 'setup({ onCleanup })'],
  ['arrow', 'setup: ({ onCleanup }) =>'],
  ['function', 'setup: function ({ onCleanup })']
]) {
  test(`inline project setup supports ${name} syntax without executing on the server`, async t => {
    // Keep DOM access inside setup so loading the server config cannot execute browser initialization.
    const root = await mkdtemp(path.join(os.tmpdir(), 'svelte-preview-inline-setup-'));
    let server;
    t.after(async () => {
      await server?.close();
      await rm(root, { recursive: true, force: true });
    });
    await symlink(fileURLToPath(new URL('../../../examples/demo/node_modules', import.meta.url)), path.join(root, 'node_modules'));
    await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
    await writeFile(path.join(root, 'Card.svelte'), '<p>Card</p>');
    await writeFile(path.join(root, 'Card.preview.js'), 'export default {};');
    await writeFile(path.join(root, 'svelte-preview.config.mjs'), `export default {
      ${declaration} {
        document.documentElement.setAttribute('theme', 'g100');
        onCleanup(() => document.documentElement.removeAttribute('theme'));
      }
    };`);

    // Compile the browser hook through Vite, preserving its cleanup while excluding it from the gallery.
    server = await startPreviewServer({ root });
    const frame = await server.transformRequest('/@svelte-preview/frame?file=Card.svelte');
    const gallery = await server.transformRequest('/@svelte-preview/gallery?file=Card.svelte');
    assert.match(frame.code, /document\.documentElement\.setAttribute/);
    assert.match(frame.code, /onCleanup/);
    assert.match(frame.code, /boot\(definition, [^;]*, setup\)/);
    assert.doesNotMatch(gallery.code, /document\.documentElement|g100/);
  });
}
