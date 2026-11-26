import assert from 'node:assert/strict';
import test from 'node:test';
import { listServices } from '../../../examples/demo/src/lib/infrastructure/ServiceRepository.js';
import { runPreviewSetup } from '../setup.mjs';

test('the named repository function uses the preview fetch override', async t => {
  // Register the demo's real API route through the same setup hook as its preview.
  const services = [
    { id: 'edge', name: 'Edge gateway', protocol: 'HTTPS', port: 443, routing: 'Round robin' }
  ];
  t.after(runPreviewSetup(({ http }) => {
    http.get('/api/v1/projects/studio/services', { body: services });
  }));
  assert.deepEqual(await listServices('studio'), services);
});

test('the normal repository reads services and reports failed requests', async t => {
  // Exercise URL encoding and pass cancellation through to the underlying fetch.
  const controller = new AbortController();
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/v1/projects/studio%2Fone/services');
    assert.equal(options.signal, controller.signal);
    return Response.json([]);
  });
  assert.deepEqual(await listServices('studio/one', controller.signal), []);

  // HTTP failures reject the request so the component can render its error state.
  fetch.mock.mockImplementation(async () => new Response(null, { status: 503 }));
  await assert.rejects(listServices('studio'), /Could not load service endpoints \(503\)/);
});
