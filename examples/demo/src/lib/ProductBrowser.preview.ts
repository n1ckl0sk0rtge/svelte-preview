import { definePreviews } from 'svelte-preview';
import ProductBrowser from './ProductBrowser.svelte';

const product = {
  name: 'Studio headphones',
  price: 129,
  available: true
};

const productPath = '/api/v1/projects/studio/products/headphones';

export default definePreviews(ProductBrowser, {
  Loaded: {
    props: {},
    setup({ http }) {
      http.get(productPath, { body: product });
    },
    viewport: { width: 360, height: 460 }
  },
  Loading: {
    props: {},
    setup({ http }) {
      http.get(productPath, { pending: true });
    },
    viewport: { width: 320, height: 460 }
  },
  Empty: {
    props: {},
    setup({ http }) {
      http.get(productPath, { body: null });
    },
    viewport: { width: 360, height: 240 }
  },
  Error: {
    props: {},
    setup({ http }) {
      http.get(productPath, { status: 503 });
    },
    viewport: { width: 360, height: 240 }
  }
});
