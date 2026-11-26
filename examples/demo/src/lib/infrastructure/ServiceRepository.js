/**
 * @typedef {object} Service
 * @property {string} id
 * @property {string} name
 * @property {string} protocol
 * @property {number} port
 * @property {string} routing
 */

/**
 * @param {string} projectId
 * @param {AbortSignal} [signal]
 * @returns {Promise<Service[]>}
 */
export async function listServices(projectId, signal) {
  // Use the project-scoped API and surface errors as a rejected request.
  const response = await fetch(`/api/v1/projects/${encodeURIComponent(projectId)}/services`, { signal });
  if (!response.ok) throw new Error(`Could not load service endpoints (${response.status}).`);

  // Parse the API response into the rows displayed by the table.
  return response.json();
}
