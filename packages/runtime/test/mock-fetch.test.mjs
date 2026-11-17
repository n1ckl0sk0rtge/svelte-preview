import assert from 'node:assert/strict';
import test from 'node:test';
import { mockFetch } from '../mock-fetch.mjs';

test('mock fetch installs lazily, matches methods and paths, and passes unrelated requests through', async t => {
  // Defining a preview must not alter fetch before its setup runs.
  const fallback = t.mock.method(globalThis, 'fetch', async () => Response.json({ passthrough: true }));
  const setup = mockFetch({
    'GET /products': { body: [{ name: 'Headphones' }] },
    'POST /products': { body: { saved: true }, status: 201 }
  });
  assert.equal(globalThis.fetch, fallback);
  const cleanup = setup();
  t.after(cleanup);

  // Each call receives a fresh body, including requests expressed as URLs or Request objects.
  assert.deepEqual(await (await fetch('/products')).json(), [{ name: 'Headphones' }]);
  assert.deepEqual(await (await fetch(new URL('https://api.example/products?sort=name'))).json(), [{ name: 'Headphones' }]);
  const saved = await fetch(new Request('https://api.example/products', { method: 'POST' }));
  assert.equal(saved.status, 201);
  assert.deepEqual(await saved.json(), { saved: true });
  assert.deepEqual(await (await fetch('/products', { method: 'post' })).json(), { saved: true });

  // Unmatched methods and development resources retain their original arguments and transport.
  const options = { method: 'DELETE' };
  await fetch('/products', options);
  await fetch('/@vite/client');
  assert.equal(fallback.mock.callCount(), 2);
  assert.deepEqual(fallback.mock.calls[0].arguments, ['/products', options]);
  cleanup();
  assert.equal(globalThis.fetch, fallback);
});

test('mock fetch supports empty responses and HTTP failures', async t => {
  const cleanup = mockFetch({
    'GET /empty': { body: null },
    'GET /offline': { status: 503, body: { message: 'Offline' } },
    'GET /no-content': { status: 204 }
  })();
  t.after(cleanup);
  assert.equal(await (await fetch('/empty')).json(), null);
  const failed = await fetch('/offline');
  assert.equal(failed.ok, false);
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { message: 'Offline' });
  assert.equal(await (await fetch('/no-content')).text(), '');
});

test('pending mocks honor request cancellation and preview cleanup', async t => {
  const original = globalThis.fetch;
  const cleanup = mockFetch({ 'GET /loading': { pending: true } })();
  t.after(cleanup);

  // Cancel one request without affecting another pending request in the same preview.
  const controller = new AbortController();
  const cancelled = assert.rejects(fetch('/loading', { signal: controller.signal }), { name: 'AbortError' });
  const closed = assert.rejects(fetch('/loading'), { name: 'AbortError' });
  controller.abort();
  await cancelled;

  // Closing the preview releases remaining requests and restores the original fetch.
  cleanup();
  await closed;
  assert.equal(globalThis.fetch, original);
  cleanup();
  assert.equal(globalThis.fetch, original);
});
