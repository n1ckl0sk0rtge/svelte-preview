<script>
  import { getProduct } from '$lib/infrastructure/ProductRepository.js';
  import ProductCard from './ProductCard.svelte';

  let { projectId = 'studio', productId = 'headphones' } = $props();

  // Fetch again when the selected project or product changes.
  let request = $derived(getProduct(projectId, productId));
</script>

<section class="collection" aria-label="Studio collection">
  <header>
    <p class="eyebrow">THE EVERYDAY EDIT</p>
    <h1>Studio collection</h1>
    <p class="intro">Thoughtful essentials for your daily rhythm.</p>
  </header>
  {#await request}
    <ProductCard loading />
  {:then product}
    {#if product}
      <ProductCard {product} />
    {:else}
      <p class="notice" role="status">No products yet.</p>
    {/if}
  {:catch error}
    <p class="notice" role="alert">{error instanceof Error ? error.message : String(error)}</p>
  {/await}
</section>

<style>
  .collection { display: grid; gap: 20px; }
  .eyebrow { margin: 0 0 8px; color: #69775b; font-size: 9px; font-weight: 650; letter-spacing: 1.5px; }
  h1 { margin: 0; color: #252c22; font-size: 23px; font-weight: 650; letter-spacing: -.6px; }
  .notice { margin: 0; color: #6e7469; font-size: 12px; line-height: 1.5; }
  .intro { margin: 7px 0 0; color: #6e7469; font-size: 12px; line-height: 1.5; }
</style>
