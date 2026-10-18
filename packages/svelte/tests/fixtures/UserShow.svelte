<script lang="ts">
  let { user }: { user: { name: string } } = $props()
</script>

<h1>Showing {user.name}</h1>
