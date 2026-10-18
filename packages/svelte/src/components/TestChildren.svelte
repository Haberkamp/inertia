<script lang="ts">
  import { getContext, type Snippet } from 'svelte'

  // Renders the children of the <InertiaTestApp> that owns this app, in place of a page component
  const context = getContext<{ children?: Snippet }>('inertia:test-children')
</script>

{@render context.children?.()}
