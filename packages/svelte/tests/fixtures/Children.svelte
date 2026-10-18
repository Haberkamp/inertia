<script lang="ts">
  import { InertiaTestApp, type InertiaTestAppProps } from '@inertiajs/svelte/testing'
  import CurrentUser from './CurrentUser.svelte'
  import Draft from './Draft.svelte'
  import ValidatedName from './ValidatedName.svelte'

  let { show, ...props }: InertiaTestAppProps & { show: ('user' | 'draft' | 'validated')[] } = $props()
</script>

<InertiaTestApp {...props}>
  {#if show.includes('user')}<CurrentUser />{/if}
  {#if show.includes('draft')}<Draft />{/if}
  {#if show.includes('validated')}<ValidatedName />{/if}
</InertiaTestApp>
