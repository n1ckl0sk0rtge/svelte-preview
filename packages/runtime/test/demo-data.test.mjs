import assert from 'node:assert/strict';
import test from 'node:test';
import { getProduct } from '../../../examples/demo/src/lib/infrastructure/ProductRepository.js';

test('the named repository function uses the preview fetch override', async t => {
  const product = { name: 'Preview headphones', price: 42, available: true };
  t.mock.method(globalThis, 'fetch', async () => Response.json(product));
  assert.deepEqual(await getProduct('studio', 'headphones'), product);
});

test('the normal repository reads the product and reports failed requests', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(url, '/api/v1/projects/studio%20one/products/head%2Fphones');
    return Response.json({ name: 'Headphones' });
  });
  assert.deepEqual(await getProduct('studio one', 'head/phones'), { name: 'Headphones' });
  fetch.mock.mockImplementation(async () => new Response(null, { status: 503 }));
  await assert.rejects(getProduct('studio', 'headphones'), /Could not load product \(503\)/);
});
