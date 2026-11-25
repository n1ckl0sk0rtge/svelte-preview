import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const cli = fileURLToPath(new URL('../bin/svelte-preview.mjs', import.meta.url));
const skillPath = path.join('.agents', 'skills', 'svelte-preview', 'SKILL.md');

test('the CLI installs the bundled skill into the selected project and preserves local edits', async t => {
  // Use empty projects so installing a skill cannot depend on launching the preview runtime.
  const root = await mkdtemp(path.join(os.tmpdir(), 'svelte-preview-skill-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = path.join(root, 'example project');
  await mkdir(project);
  const run = (...args) => exec(process.execPath, [cli, ...args], { cwd: root, timeout: 10_000 });
  const bundled = await readFile(new URL('../skills/svelte-preview/SKILL.md', import.meta.url), 'utf8');

  // Document both CLI modes and default to installing in the working directory.
  assert.match((await run('--help')).stdout, /svelte-preview install-skill/);
  assert.match((await run('install-skill')).stdout, /Svelte Preview skill installed at/);
  assert.equal(await readFile(path.join(root, skillPath), 'utf8'), bundled);

  // Concurrent installs into an explicit root publish one complete copy.
  const install = () => run('install-skill', '--root', project);
  await Promise.all([install(), install()]);
  const installed = path.join(project, skillPath);
  assert.equal(await readFile(installed, 'utf8'), bundled);
  assert.deepEqual(await readdir(path.dirname(installed)), ['SKILL.md']);

  // Reinstalling over a customized skill reports the conflict and keeps the user's file.
  const customized = bundled + '\nCustom project guidance.\n';
  await writeFile(installed, customized);
  await assert.rejects(install(), { code: 1, stderr: /A different skill already exists/ });
  assert.equal(await readFile(installed, 'utf8'), customized);
  assert.deepEqual(await readdir(path.dirname(installed)), ['SKILL.md']);
});
