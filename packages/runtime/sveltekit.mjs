export function createSvelteKitState() {
  // Each browser document owns its page fixtures; preserve the exported object's identity during setup.
  const page = {};
  const navigating = { from: null, to: null, type: null, willUnload: null, delta: null, complete: null };
  const updated = { current: false, check: async () => false };

  const configurePage = (defaults = {}, overrides = {}) => {
    // Clone fixture objects so mutation in a component cannot change its definition or another frame.
    const fixture = structuredClone({ ...defaults, ...overrides });
    Object.assign(page, {
      url: new URL(fixture.url ?? '/', 'http://preview.local'),
      params: fixture.params ?? {},
      route: fixture.route ?? { id: null },
      data: fixture.data ?? {},
      state: fixture.state ?? {},
      shallow: null,
      status: fixture.status ?? 200,
      error: fixture.error ?? null,
      form: fixture.form ?? null
    });
  };

  const goto = async (url, options) => {
    // Keep the preview mounted while making navigation interactions visible in the frame's console.
    const destination = new URL(url, page.url).href;
    console.info('[svelte-preview] goto()', destination, options ?? {});
  };

  configurePage();
  return { page, navigating, updated, configurePage, goto };
}
