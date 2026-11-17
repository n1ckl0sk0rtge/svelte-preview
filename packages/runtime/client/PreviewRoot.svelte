<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import type { Component } from 'svelte';
  import type { PreviewSetup } from '../index.js';
  import { runPreviewSetup } from '../setup.mjs';

  let { component: View, props, projectSetup, setup }: {
    component: Component<any>;
    props: Record<string, unknown>;
    projectSetup?: PreviewSetup;
    setup?: PreviewSetup;
  } = $props();

  // Establish project defaults before state setup, once during initialization and before descendants are created.
  const cleanup = untrack(() => runPreviewSetup(projectSetup, setup));

  // Dispose repositories and subscriptions with the component tree when its frame is unloaded.
  onDestroy(cleanup);
</script>

<View {...props} />
