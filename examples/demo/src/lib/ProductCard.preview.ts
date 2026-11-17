import { definePreviews } from 'svelte-preview';
import ProductCard from './ProductCard.svelte';
const product = {
  name: 'Studio headphones',
  price: 129,
  available: true
};

export default definePreviews(ProductCard, {
  Default: {
    // Use the project's default viewport for this preview.
    props: { product }
  },
  Loading: {
    props: { product: null, loading: true },
    viewport: { width: 320, height: 340 }
  },
  Unavailable: {
    props: { product: { ...product, available: false } },
    viewport: { width: 390, height: 400 }
  }
});
