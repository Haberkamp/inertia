<script lang="ts">
  import { Link } from '@inertiajs/svelte'

  let { users }: { users: { id: number; name: string }[] } = $props()
</script>

<ul>
  {#each users as user (user.id)}
    <li><Link href="/users/{user.id}">{user.name}</Link></li>
  {/each}
</ul>
