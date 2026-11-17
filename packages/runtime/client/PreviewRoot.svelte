<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import type { Component } from 'svelte';
  import type { PreviewSetup } from '../index.js';
  import { runPreviewSetup } from '../setup.mjs';

  let { component: View, props, setup }: {
    component: Component<any>;
    props: Record<string, unknown>;
    setup?: PreviewSetup;
  } = $props();

  // Establish context once during this wrapper's initialization, before descendants are created.
  const cleanup = untrack(() => runPreviewSetup(setup));

  // Dispose repositories and subscriptions with the component tree when its frame is unloaded.
  onDestroy(cleanup);
</script>

<View {...props} />
