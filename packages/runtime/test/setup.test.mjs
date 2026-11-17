import assert from 'node:assert/strict';
import test from 'node:test';
import { runPreviewSetup } from '../setup.mjs';

test('setup registers multiple HTTP responses with shared automatic cleanup', async t => {
  const original = globalThis.fetch;
  const cleanup = runPreviewSetup(({ http }) => {
    http.get('/products', { body: ['Headphones'] });
    http.get('/user', { body: { name: 'Alex' } });
    http.post('/products', { status: 201, body: { saved: true } });
    http.get('/loading', { pending: true });
    http.get('/user', { body: { name: 'Sam' } });
  });
  t.after(cleanup);

  // Registrations coexist, while a later registration for the same request replaces its response.
  assert.deepEqual(await (await fetch('/products')).json(), ['Headphones']);
  assert.deepEqual(await (await fetch('/user')).json(), { name: 'Sam' });
  const saved = await fetch('/products', { method: 'POST' });
  assert.equal(saved.status, 201);
  assert.deepEqual(await saved.json(), { saved: true });

  // Automatic disposal restores fetch and cancels requests held in their loading state.
  const cancelled = assert.rejects(fetch('/loading'), { name: 'AbortError' });
  cleanup();
  await cancelled;
  assert.equal(globalThis.fetch, original);
});

test('general setup cleans up custom resources and returned cleanup once in reverse order', () => {
  const original = globalThis.fetch;
  const released = [];
  const cleanup = runPreviewSetup(({ onCleanup }) => {
    onCleanup(() => released.push('subscription'));
    onCleanup(() => released.push('timer'));
    return () => released.push('returned');
  });

  // Resource-only setups do not install a fetch interceptor.
  assert.equal(globalThis.fetch, original);
  assert.deepEqual(released, []);
  cleanup();
  cleanup();
  assert.deepEqual(released, ['returned', 'timer', 'subscription']);
  runPreviewSetup()();
});

test('failed setup rolls back installed mocks and registered resources', () => {
  const original = globalThis.fetch;
  const released = [];

  // A partial setup must not leave mocks or resources behind when initialization fails.
  assert.throws(() => runPreviewSetup(({ http, onCleanup }) => {
    http.get('/products', { body: [] });
    onCleanup(() => released.push('subscription'));
    throw new Error('Could not initialize');
  }), /Could not initialize/);
  assert.equal(globalThis.fetch, original);
  assert.deepEqual(released, ['subscription']);

  // Reject unsupported setup return values with the same rollback behavior.
  assert.throws(() => runPreviewSetup(({ http }) => {
    http.get('/products', { body: [] });
    return Promise.resolve();
  }), /must be synchronous/);
  assert.equal(globalThis.fetch, original);
});

test('a failing custom cleanup does not prevent other resources and fetch from being released', () => {
  const original = globalThis.fetch;
  const released = [];
  const cleanup = runPreviewSetup(({ http, onCleanup }) => {
    http.get('/products', { body: [] });
    onCleanup(() => released.push('subscription'));
    onCleanup(() => { throw new Error('Cleanup failed'); });
  });

  assert.throws(cleanup, /Cleanup failed/);
  assert.deepEqual(released, ['subscription']);
  assert.equal(globalThis.fetch, original);
  cleanup();
});

test('HTTP methods register independent responses on the same path', async t => {
  const cleanup = runPreviewSetup(({ http }) => {
    http.get('/products', { body: 'read' });
    http.post('/products', { body: 'created', status: 201 });
    http.put('/products', { body: 'replaced' });
    http.patch('/products', { body: 'updated' });
    http.delete('/products', { status: 204 });
    http.head('/products', { body: 'omitted' });
    http.options('/products', { status: 204 });
  });
  t.after(cleanup);

  // Every method matches its own response, including empty bodies for HEAD and no-content statuses.
  for (const [method, status, body] of [
    ['GET', 200, '"read"'],
    ['POST', 201, '"created"'],
    ['PUT', 200, '"replaced"'],
    ['PATCH', 200, '"updated"'],
    ['DELETE', 204, ''],
    ['HEAD', 200, ''],
    ['OPTIONS', 204, '']
  ]) {
    const response = await fetch('/products', { method });
    assert.equal(response.status, status, method);
    assert.equal(await response.text(), body, method);
  }
});

test('project setup runs before state setup with shared mocks and reverse cleanup', async t => {
  // Establish project defaults, then let a state override them in the same setup context.
  const original = globalThis.fetch;
  const events = [];
  let projectContext;
  const cleanup = runPreviewSetup(context => {
    projectContext = context;
    events.push('project');
    context.http.get('/theme', { body: 'project' });
    context.http.get('/shared', { body: 'shared' });
    context.onCleanup(() => events.push('project cleanup'));
  }, undefined, context => {
    assert.equal(context.http, projectContext.http);
    events.push('state');
    context.http.get('/theme', { body: 'state' });
    return () => events.push('state cleanup');
  });
  t.after(cleanup);

  // State overrides keep unrelated project mocks and dispose before project defaults.
  assert.deepEqual(events, ['project', 'state']);
  assert.equal(await (await fetch('/theme')).json(), 'state');
  assert.equal(await (await fetch('/shared')).json(), 'shared');
  cleanup();
  cleanup();
  assert.deepEqual(events, ['project', 'state', 'state cleanup', 'project cleanup']);
  assert.equal(globalThis.fetch, original);
});

test('failed state setup also rolls back project resources', () => {
  // A state that cannot initialize must release everything established by project setup.
  const original = globalThis.fetch;
  const events = [];
  assert.throws(() => runPreviewSetup(({ http, onCleanup }) => {
    http.get('/shared', { body: 'shared' });
    onCleanup(() => events.push('project cleanup'));
  }, ({ onCleanup }) => {
    onCleanup(() => events.push('state cleanup'));
    throw new Error('State setup failed');
  }), /State setup failed/);
  assert.deepEqual(events, ['state cleanup', 'project cleanup']);
  assert.equal(globalThis.fetch, original);
});
