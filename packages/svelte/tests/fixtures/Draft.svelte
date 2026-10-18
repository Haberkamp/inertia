<script lang="ts">
  import { useRemember } from '@inertiajs/svelte'

  const draft = useRemember({ value: '' }, 'draft')
</script>

<div>
  <span>draft: {draft.value}</span>
  <button onclick={() => (draft.value = 'written')}>write</button>
</div>
