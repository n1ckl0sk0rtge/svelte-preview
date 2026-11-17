export function validateViewport(viewport) {
  if (viewport === 'auto') return;
  if (!viewport || !['width', 'height'].every((key) => Number.isInteger(viewport[key]) && viewport[key] >= 100 && viewport[key] <= 4096)) {
    throw new Error('Preview viewport must be auto, or width and height must be integers between 100 and 4096.');
  }
}

export function definePreviews(component, states) {
  // Reject malformed definitions before mounting any component instances.
  if (typeof component !== 'function' || !states || typeof states !== 'object' || !Object.keys(states).length) {
    throw new Error('definePreviews needs a Svelte 5 component and at least one named state.');
  }

  // Keep props as JavaScript values so callbacks and richer fixtures remain usable.
  for (const [name, state] of Object.entries(states)) {
    if (!name.trim() || !state || !state.props || typeof state.props !== 'object' || Array.isArray(state.props)) {
      throw new Error(`Preview state "${name}" needs a props object.`);
    }
    if (state.viewport) validateViewport(state.viewport);
    if (state.setup !== undefined && typeof state.setup !== 'function') {
      throw new Error(`Preview state "${name}" setup must be a function.`);
    }
    if (state.setup?.constructor.name === 'AsyncFunction') {
      throw new Error(`Preview state "${name}" setup must be synchronous. Start async work with onMount instead.`);
    }
  }

  return { component, states };
}

export function defineConfig(config) {
  return config;
}
