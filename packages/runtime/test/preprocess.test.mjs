import assert from 'node:assert/strict';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { startPreviewServer } from '../server.mjs';

const configurations = [
  { name: 'without a Svelte config', config: null, color: 'red' },
  { name: 'with compiler options but no preprocessor', config: 'export default { compilerOptions: { dev: true } };', color: 'red' },
  { name: 'with an explicit project preprocessor', config: `export default {
    preprocess: { style: () => ({ code: '.card { color: blue; }' }) }
  };`, color: 'blue' }
];

for (const { name, config, color } of configurations) {
  test(`preview compiles SCSS ${name}`, async t => {
    // Isolate each configuration while reusing the installed compiler and Sass dependencies.
    const root = await mkdtemp(path.join(os.tmpdir(), 'svelte-preview-scss-'));
    let server;
    t.after(async () => {
      await server?.close();
      await rm(root, { recursive: true, force: true });
    });
    await symlink(fileURLToPath(new URL('../node_modules', import.meta.url)), path.join(root, 'node_modules'));
    await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
    if (config) await writeFile(path.join(root, 'svelte.config.mjs'), config);
    await writeFile(path.join(root, 'Card.svelte'), `<p class="card">Card</p>
<style lang="scss">
  // SCSS comments and variables must be handled before Svelte parses CSS.
  $color: red;
  .card { color: $color; }
</style>`);

    // These immutable fixtures do not need HMR; delayed filesystem events can otherwise restart Vite mid-assertion.
    server = await startPreviewServer({ root });
    await server.watcher.close();

    // Compile through the real preview pipeline and verify project preprocessors take precedence.
    const component = await server.transformRequest('/Card.svelte');
    assert.match(component.code, /Card/);
    const style = await server.transformRequest('/Card.svelte?svelte&type=style&lang.css');
    assert.match(style.code, new RegExp(`color: ${color}`));
    assert.doesNotMatch(style.code, /\$color|SCSS comments/);
  });
}

test('preview style plugins compile configured global styles inside frames', async t => {
  // Reuse dependencies while keeping the style plugin and its input local to this test.
  const root = await mkdtemp(path.join(os.tmpdir(), 'svelte-preview-style-plugin-'));
  let server;
  t.after(async () => {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  });
  await symlink(fileURLToPath(new URL('../node_modules', import.meta.url)), path.join(root, 'node_modules'));
  await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await writeFile(path.join(root, 'Card.svelte'), '<p>Card</p>');
  await writeFile(path.join(root, 'Card.preview.js'), 'export default {};');
  await writeFile(path.join(root, 'app.css'), 'body { color: PREVIEW_COLOR; }');
  await writeFile(path.join(root, 'svelte-preview.config.mjs'), `export default {
    styles: ['./app.css'],
    plugins: [{
      name: 'preview-style-test',
      enforce: 'pre',
      transform(code, id) {
        if (id.endsWith('/app.css')) return code.replace('PREVIEW_COLOR', 'rebeccapurple');
      }
    }]
  };`);

  // The frame imports transformed project CSS while the gallery stays independent of those styles.
  server = await startPreviewServer({ root });
  const frame = await server.transformRequest('/@svelte-preview/frame?file=Card.svelte');
  const gallery = await server.transformRequest('/@svelte-preview/gallery?file=Card.svelte');
  assert.match(frame.code, /app\.css/);
  assert.doesNotMatch(gallery.code, /app\.css/);
  const style = await server.transformRequest('/app.css');
  assert.match(style.code, /color: rebeccapurple/);
  assert.doesNotMatch(style.code, /PREVIEW_COLOR/);
});
