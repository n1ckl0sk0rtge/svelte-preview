#!/usr/bin/env node
import { link, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

const serverUsage = 'svelte-preview [--root <project-directory>] [--port <port>] [--mode <mode>]';
const skillUsage = 'svelte-preview install-skill [--root <project-directory>]';

async function installSkill(root) {
  // Install the skill bundled with this runtime into the selected project's skill directory.
  const bundled = await readFile(new URL('../skills/svelte-preview/SKILL.md', import.meta.url));
  const directory = path.join(await realpath(root), '.agents', 'skills', 'svelte-preview');
  const destination = path.join(directory, 'SKILL.md');
  await mkdir(directory, { recursive: true });

  // Publish the complete file in one step so concurrent installs can compare identical contents.
  const staging = await mkdtemp(path.join(directory, '.install-'));
  const staged = path.join(staging, 'SKILL.md');
  try {
    await writeFile(staged, bundled);
    await link(staged, destination);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (!(await lstat(destination)).isFile() || !(await readFile(destination)).equals(bundled)) {
      throw new Error(`A different skill already exists at ${destination}. Move it before reinstalling.`);
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  console.log(`Svelte Preview skill installed at ${destination}`);
}

async function startPreview({ root, port: requestedPort, mode }) {
  // Emit one machine-readable readiness message after the HTTP server is listening.
  const port = Number(requestedPort);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port.');
  const { startPreviewServer } = await import('../server.mjs');
  const server = await startPreviewServer({ root, port, mode });
  console.log(`SVELTE_PREVIEW_READY ${JSON.stringify({ url: server.resolvedUrls.local[0] })}`);

  // Release the listener and file watchers when the IDE stops the child process.
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await server.close();
    process.exit(0);
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

try {
  // Keep server startup options compatible with IDE launches and give the installer its own options.
  const args = process.argv.slice(2);
  const installing = args[0] === 'install-skill';
  const options = {
    root: { type: 'string', default: process.cwd() },
    help: { type: 'boolean', short: 'h' }
  };
  if (installing) args.shift();
  else {
    options.port = { type: 'string', default: '0' };
    options.mode = { type: 'string' };
  }
  const { values } = parseArgs({ args, options });

  // Help and skill installation finish without starting a preview server.
  if (values.help) console.log(installing ? skillUsage : `${serverUsage}\n${skillUsage}`);
  else if (installing) await installSkill(values.root);
  else await startPreview(values);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
