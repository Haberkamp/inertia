<script lang="ts">
  import { Deferred, page } from '@inertiajs/svelte'
</script>

<Deferred data="stats">
  {#snippet fallback()}
    <p>loading</p>
  {/snippet}
  <p>{page.props.stats.visits} visits</p>
</Deferred>
