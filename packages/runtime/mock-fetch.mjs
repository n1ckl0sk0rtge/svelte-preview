export function mockFetch(responses) {
  return () => {
    // Install only when the preview mounts, leaving metadata discovery and configuration imports untouched.
    const original = globalThis.fetch;
    const lifetime = new AbortController();
    const fetch = async (input, options = {}) => {
      // Match the HTTP method and path; unrelated requests retain their original transport.
      const url = new URL(input instanceof Request ? input.url : input, globalThis.location?.href ?? 'http://localhost');
      const method = (options.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      const response = responses[`${method} ${url.pathname}`];
      if (!response) return original.call(globalThis, input, options);

      // Pending mock requests honor caller cancellation as well as preview cleanup.
      const caller = options.signal ?? (input instanceof Request ? input.signal : undefined);
      const signal = caller ? AbortSignal.any([caller, lifetime.signal]) : lifetime.signal;
      signal.throwIfAborted();
      if (response.pending) {
        return new Promise((_, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
      }

      // Create a fresh response for every read, including failures and responses with no body.
      const status = response.status ?? 200;
      return method === 'HEAD' || [204, 205, 304].includes(status) ? new Response(null, { status })
        : Response.json(response.body ?? null, { status });
    };

    // Restore the original transport and release any indefinitely loading requests.
    globalThis.fetch = fetch;
    return () => {
      lifetime.abort();
      if (globalThis.fetch === fetch) globalThis.fetch = original;
    };
  };
}
