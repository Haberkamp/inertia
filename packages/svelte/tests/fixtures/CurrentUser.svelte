<script lang="ts">
  import { page } from '@inertiajs/svelte'
</script>

<p>{page.props.auth.user} on {page.url}</p>
