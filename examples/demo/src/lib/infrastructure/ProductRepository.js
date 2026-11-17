export async function getProduct(projectId, productId) {
  const response = await fetch(`/api/v1/projects/${encodeURIComponent(projectId)}/products/${encodeURIComponent(productId)}`);
  if (!response.ok) throw new Error(`Could not load product (${response.status}).`);
  return response.json();
}
