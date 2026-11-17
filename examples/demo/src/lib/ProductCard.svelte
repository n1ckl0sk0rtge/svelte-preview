<script>
  let { product = null, loading = false } = $props();

  let added = $state(0);
</script>

<article class="product-card" aria-busy={loading}>
  {#if loading}
    <div class="visual skeleton" aria-hidden="true"></div>
    <div class="skeleton skeleton-title" aria-hidden="true"></div>
    <div class="skeleton skeleton-price" aria-hidden="true"></div>
    <p class="loading-label" role="status">Loading product…</p>
    <button disabled>Loading…</button>
  {:else if product}
    <div class="visual">
      <span class="category">STUDIO COLLECTION</span>
      <div class="headphones" aria-hidden="true">
        <span class="headband"></span>
        <span class="ear left"></span>
        <span class="ear right"></span>
      </div>
      {#if !product.available}
        <span class="stock-badge">Sold out</span>
      {/if}
    </div>

    <div class="details">
      <h2>{product.name}</h2>
      <p class="description">A little more room for your music.</p>
      <p class="price">${product.price.toFixed(2)} <span>USD</span></p>
    </div>

    <button disabled={!product.available} onclick={() => added += 1}>
      {product.available ? (added ? `Added to bag · ${added}` : 'Add to bag') : 'Currently unavailable'}
    </button>
    <span class="visually-hidden" role="status">{added ? `${added} added to bag` : ''}</span>
  {:else}
    <p class="empty">No product selected.</p>
  {/if}
</article>

<style>
  .product-card {
    width: 100%;
    padding: 18px;
    border: 1px solid #e4e3de;
    border-radius: 18px;
    background: #fff;
    box-shadow: 0 5px 18px #292c2508;
  }

  .visual {
    position: relative;
    display: grid;
    height: 112px;
    place-items: center;
    overflow: hidden;
    border-radius: 10px;
    background: #eeeee9;
  }

  .category {
    position: absolute;
    top: 12px;
    left: 12px;
    color: #696e62;
    font-size: 8px;
    font-weight: 650;
    letter-spacing: 1.2px;
  }

  .headphones {
    position: relative;
    width: 80px;
    height: 78px;
    margin-top: 12px;
    transform: rotate(-12deg);
  }

  .headband {
    position: absolute;
    inset: 0 5px 12px;
    border: 9px solid #343d32;
    border-bottom: 0;
    border-radius: 45px 45px 0 0;
  }

  .ear {
    position: absolute;
    bottom: 0;
    width: 23px;
    height: 37px;
    border: 4px solid #293326;
    border-radius: 9px;
    background: #69775b;
    box-shadow: 3px 3px 4px #17221220;
  }

  .left { left: 0; }
  .right { right: 0; }

  .stock-badge {
    position: absolute;
    right: 9px;
    bottom: 9px;
    padding: 4px 8px;
    border-radius: 20px;
    background: #fff;
    color: #63685e;
    font-size: 10px;
  }

  .details { padding: 14px 0 13px; }

  h2 {
    margin: 0;
    color: #252c22;
    font-size: 18px;
    font-weight: 650;
    letter-spacing: -0.5px;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }

  .description {
    margin: 5px 0 12px;
    color: #6e7469;
    font-size: 11px;
  }

  .price {
    margin: 0;
    color: #252c22;
    font-size: 19px;
    font-weight: 650;
    letter-spacing: -0.5px;
  }

  .price span {
    margin-left: 4px;
    color: #81877c;
    font-size: 9px;
    font-weight: 500;
    letter-spacing: 0;
  }

  button {
    width: 100%;
    min-height: 37px;
    border: 0;
    border-radius: 8px;
    background: #354a2e;
    color: #fff;
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }

  button:hover:not(:disabled) { background: #24381d; }
  button:focus-visible { outline: 3px solid #a3be91; outline-offset: 3px; }
  button:disabled { background: #eaece6; color: #72786b; cursor: default; }

  .skeleton { border-radius: 7px; background: #eeeee9; }
  .skeleton-title { width: 72%; height: 21px; margin-top: 16px; }
  .skeleton-price { width: 37%; height: 18px; margin-top: 9px; }
  .loading-label { margin: 8px 0 13px; color: #6e7469; font-size: 11px; }
  .empty { margin: 20px 0; color: #6e7469; font-size: 13px; }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
