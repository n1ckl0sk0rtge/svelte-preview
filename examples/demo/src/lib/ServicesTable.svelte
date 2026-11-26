<script lang="ts">
  import { DataTable, DataTableSkeleton } from 'carbon-components-svelte';
  import { getAbortSignal } from 'svelte';
  import { listServices } from './infrastructure/ServiceRepository.js';

  let { projectId = 'studio' } = $props();

  // Fetch the selected project's services and cancel when the project or frame changes.
  const request = $derived(listServices(projectId, getAbortSignal()));

  const headers = [
    { key: 'name', value: 'Service' },
    { key: 'protocol', value: 'Protocol' },
    { key: 'port', value: 'Port' },
    { key: 'routing', value: 'Routing' }
  ] as const;
</script>

{#await request}
  <DataTableSkeleton {headers} rows={3} size="sm" showToolbar={false} />
{:then rows}
  <DataTable
    title="Service endpoints"
    description={rows.length ? '' : 'No service endpoints yet.'}
    {headers}
    {rows}
    size="sm"
    sortable
  />
{:catch error}
  <p class="notice" role="alert">{error instanceof Error ? error.message : String(error)}</p>
{/await}

<style>
  .notice {
    padding: 1rem;
    background: var(--cds-layer);
    color: var(--cds-text-primary);
  }
</style>
