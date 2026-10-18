<script lang="ts">
  import { page, useForm } from '@inertiajs/svelte'

  const form = useForm({ name: '' })
</script>

<form
  onsubmit={(event) => {
    event.preventDefault()
    form.post('/users')
  }}
>
  <input aria-label="name" bind:value={form.name} />
  <button type="submit">save</button>
  <span>{form.errors.name}</span>
  <span>{page.flash.message}</span>
</form>
