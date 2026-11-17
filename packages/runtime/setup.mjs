import { mockFetch } from './mock-fetch.mjs';

export function runPreviewSetup(...setups) {
  // Keep registrations and their lifetime local to this preview frame.
  const cleanups = [];
  const responses = Object.create(null);
  let disposed = false;
  let fetchInstalled = false;

  const onCleanup = (callback) => {
    if (typeof callback !== 'function') throw new TypeError('onCleanup requires a function.');
    if (disposed) callback();
    else cleanups.push(callback);
  };

  const cleanup = () => {
    // Release resources in reverse registration order, even if an individual cleanup fails.
    if (disposed) return;
    disposed = true;

    const errors = [];
    for (const callback of cleanups.reverse()) {
      try {
        callback();
      } catch (error) {
        errors.push(error);
      }
    }
    cleanups.length = 0;
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, 'Preview cleanup failed.');
  };

  // Each HTTP method registers into one shared transport with automatic cleanup.
  const http = Object.fromEntries(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].map(method => [
    method.toLowerCase(),
    (path, response) => {
      if (disposed) throw new Error('Cannot register HTTP responses after the preview has closed.');
      responses[`${method} ${path}`] = response;
      if (!fetchInstalled) {
        onCleanup(mockFetch(responses)());
        fetchInstalled = true;
      }
    }
  ]));

  // Project and state setup share registrations; later hooks can override defaults before mounting.
  try {
    for (const setup of setups) {
      const result = setup?.({ http, onCleanup });
      if (result !== undefined && typeof result !== 'function') {
        throw new Error('Preview setup must be synchronous and return only a cleanup function or nothing.');
      }
      if (result) onCleanup(result);
    }
  } catch (error) {
    // Failed initialization must also undo mocks and resources that were already registered.
    try {
      cleanup();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Preview setup and cleanup failed.');
    }
    throw error;
  }
  return cleanup;
}
