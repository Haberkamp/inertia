<script module lang="ts">
  import type { HttpClient, Page, PageProps, TestPage } from '@inertiajs/core'
  import type { Snippet } from 'svelte'
  import type { ResolvedComponent } from '../types'

  export interface InertiaTestAppProps<SharedProps extends PageProps = PageProps> {
    /**
     * The page the app starts on. Anything left out gets a sensible default,
     * and `url` decides where the in-memory history starts.
     */
    page?: TestPage<SharedProps>
    /** The component to render for the initial page. Defaults to resolving `page.component`. */
    component?: ResolvedComponent
    /** Resolves page components by name, needed when the app navigates to other pages. */
    resolve?: (name: string, page?: Page) => ResolvedComponent | Promise<ResolvedComponent>
    /**
     * Answers the app's requests, usually a fake server from `createFakeServer()`.
     * Without one, requests go to the network as usual.
     */
    server?: HttpClient
    defaultLayout?: (name: string, page: Page) => unknown
    /** Rendered instead of the page component, for stories and tests of a single component. */
    children?: Snippet
  }
</script>

<script lang="ts">
  import { testScopes } from '@inertiajs/core'
  import { onMount, setContext } from 'svelte'
  import App from './App.svelte'
  import TestChildren from './TestChildren.svelte'

  const props: InertiaTestAppProps = $props()

  const owner = {}

  // The scope has to exist before <App> renders, as that's when the router initializes
  // svelte-ignore state_referenced_locally
  testScopes.acquire(owner, { url: props.page?.url ?? '/', server: props.server })

  onMount(() => {
    testScopes.mount(owner)

    return () => testScopes.release(owner)
  })

  setContext('inertia:test-children', {
    get children() {
      return props.children
    },
  })

  // svelte-ignore state_referenced_locally
  const initialPage = {
    component: 'Page',
    url: '/',
    version: null,
    flash: {},
    rescuedProps: [],
    rememberedState: {},
    ...props.page,
    props: { errors: {}, ...props.page?.props },
  } as Page

  // svelte-ignore state_referenced_locally
  const testPage: ResolvedComponent | null = props.children ? { default: TestChildren } : null

  const resolveComponent = async (name: string, page?: Page): Promise<ResolvedComponent> => {
    if (testPage) {
      return testPage
    }

    if (props.resolve) {
      return props.resolve(name, page)
    }

    if (props.component && name === initialPage.component) {
      return props.component
    }

    throw new Error(`Inertia can't resolve the "${name}" page component. Pass a \`resolve\` prop to <InertiaTestApp>.`)
  }

  // Like createInertiaApp, the initial page component is resolved before the app renders
  // svelte-ignore state_referenced_locally
  let initialComponent = $state<ResolvedComponent | null>(testPage ?? props.component ?? null)

  // svelte-ignore state_referenced_locally
  if (!initialComponent) {
    resolveComponent(initialPage.component, initialPage).then((component) => (initialComponent = component))
  }
</script>

{#if initialComponent}
  <App {initialPage} {initialComponent} {resolveComponent} defaultLayout={props.defaultLayout} serverRendered={false} />
{/if}
