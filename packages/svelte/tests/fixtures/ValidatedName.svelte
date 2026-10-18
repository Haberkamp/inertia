<script lang="ts">
  import { useForm } from '@inertiajs/svelte'

  const form = useForm('post', '/users', { name: '' })
</script>

<div>
  <input aria-label="name" bind:value={form.name} />
  <button onclick={() => form.validate('name')}>validate</button>
  <span>{form.invalid('name') ? form.errors.name : 'valid'}</span>
</div>
