#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { startPreviewServer } from '../server.mjs';

try {
  // Keep launch arguments separate from shell interpretation for IDE process startup.
  const { values } = parseArgs({
    options: {
      root: { type: 'string', default: process.cwd() },
      port: { type: 'string', default: '0' },
      help: { type: 'boolean', short: 'h' }
    }
  });
  if (values.help) {
    console.log('svelte-preview [--root <project-directory>] [--port <port>]');
    process.exit(0);
  }

  // Emit one machine-readable readiness message after the HTTP server is listening.
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('Invalid port.');
  const server = await startPreviewServer({ root: values.root, port });
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
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
