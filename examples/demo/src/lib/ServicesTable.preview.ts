import { definePreviews } from 'svelte-preview';
import ServicesTable from './ServicesTable.svelte';

const rows = [
  { id: 'edge', name: 'Edge gateway', protocol: 'HTTPS', port: 443, routing: 'Round robin' },
  { id: 'catalog', name: 'Catalog API', protocol: 'HTTPS', port: 8443, routing: 'Least connections' },
  { id: 'metrics', name: 'Metrics', protocol: 'HTTP', port: 9090, routing: 'Round robin' }
];

const servicesPath = '/api/v1/projects/studio/services';

export default definePreviews(ServicesTable, {
  Loaded: {
    props: {},
    setup({ http }) {
      http.get(servicesPath, { body: rows });
    }
  },
  Loading: {
    props: {},
    setup({ http }) {
      http.get(servicesPath, { pending: true });
    }
  },
  Empty: {
    props: {},
    setup({ http }) {
      http.get(servicesPath, { body: [] });
    }
  },
  Error: {
    props: {},
    setup({ http }) {
      http.get(servicesPath, { status: 503 });
    }
  }
});
