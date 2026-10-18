// Public entry for `@inertiajs/vue3/testing`. Import the adapter's runtime code only through './index',
// so the bundled entry shares the adapter's state instead of bundling a second copy of it.
import { HttpClient, Page, PageProps, testScopes } from '@inertiajs/core'
import {
  defineComponent,
  getCurrentInstance,
  h,
  markRaw,
  onMounted,
  onUnmounted,
  PropType,
  shallowRef,
  type Component,
  type DefineComponent,
} from 'vue'
import type { InertiaAppProps } from './app'
import { App, plugin } from './index'

type ResolvedComponent = DefineComponent | Component
type ComponentResolver = (
  name: string,
  page?: Page,
) => ResolvedComponent | Promise<ResolvedComponent> | { default: ResolvedComponent }

export interface InertiaTestAppProps<SharedProps extends PageProps = PageProps> {
  /**
   * The page the app starts on. Anything left out gets a sensible default,
   * and `url` decides where the in-memory history starts.
   */
  page?: Partial<Page<SharedProps>>
  /** The component to render for the initial page. Defaults to resolving `page.component`. */
  component?: ResolvedComponent
  /** Resolves page components by name, needed when the app navigates to other pages. */
  resolve?: ComponentResolver
  /**
   * Answers the app's requests, usually a fake server from `createFakeServer()`.
   * Without one, requests go to the network as usual.
   */
  server?: HttpClient
  titleCallback?: InertiaAppProps['titleCallback']
  defaultLayout?: InertiaAppProps['defaultLayout']
}

const makePage = (page: Partial<Page> = {}): Page => ({
  component: 'Page',
  url: '/',
  version: null,
  flash: {},
  rescuedProps: [],
  rememberedState: {},
  ...page,
  props: { errors: {}, ...page.props },
})

const unwrap = (module: ResolvedComponent | { default: ResolvedComponent }): ResolvedComponent =>
  typeof module === 'object' && module !== null && 'default' in module ? module.default : (module as ResolvedComponent)

/**
 * Renders Inertia without a server. Each app runs in its own isolated scope with in-memory
 * history and session storage, so tests and stories can't affect each other. Content in the
 * default slot is rendered instead of the page component.
 */
export const InertiaTestApp = defineComponent({
  name: 'InertiaTestApp',
  props: {
    page: { type: Object as PropType<InertiaTestAppProps['page']>, required: false },
    component: { type: [Object, Function] as PropType<ResolvedComponent>, required: false },
    resolve: { type: Function as PropType<ComponentResolver>, required: false },
    server: { type: Object as PropType<HttpClient>, required: false },
    titleCallback: { type: Function as PropType<InertiaAppProps['titleCallback']>, required: false },
    defaultLayout: { type: Function as PropType<InertiaAppProps['defaultLayout']>, required: false },
  },
  setup(props, { slots }) {
    const app = getCurrentInstance()?.appContext.app

    if (app && !('$inertia' in app.config.globalProperties)) {
      app.use(plugin)
    }

    const owner = {}

    // The scope has to exist before <App> sets up, as that's when the router initializes
    testScopes.acquire(owner, { url: props.page?.url ?? '/', server: props.server })

    onMounted(() => testScopes.mount(owner))
    onUnmounted(() => testScopes.release(owner))

    const initialPage = makePage(props.page as Partial<Page>)
    const slotPage = slots.default
      ? markRaw(defineComponent({ name: 'InertiaTestSlot', render: () => slots.default!() }))
      : null

    const resolveComponent = async (name: string, page?: Page): Promise<ResolvedComponent> => {
      if (slotPage) {
        return slotPage
      }

      if (props.resolve) {
        return unwrap(await props.resolve(name, page))
      }

      if (props.component && name === initialPage.component) {
        return props.component
      }

      throw new Error(
        `Inertia can't resolve the "${name}" page component. Pass a \`resolve\` prop to <InertiaTestApp>.`,
      )
    }

    // Like createInertiaApp, the initial page component is resolved before the app renders
    const initialComponent = shallowRef<ResolvedComponent | null>(slotPage ?? props.component ?? null)

    if (!slotPage && !props.component) {
      resolveComponent(initialPage.component, initialPage).then((component) => {
        initialComponent.value = markRaw(component)
      })
    }

    return () =>
      initialComponent.value
        ? h(App, {
            initialPage,
            initialComponent: initialComponent.value as DefineComponent,
            resolveComponent: resolveComponent as (name: string) => Promise<DefineComponent>,
            titleCallback: props.titleCallback,
            defaultLayout: props.defaultLayout,
            serverRendered: false,
          })
        : null
  },
})

export interface InertiaStoryParameters<SharedProps extends PageProps = PageProps> {
  inertia?: InertiaTestAppProps<SharedProps>
}

/**
 * A Storybook decorator that renders each story inside its own <InertiaTestApp>.
 * Configure the page per story with `parameters.inertia`.
 */
export function withInertia(defaults: InertiaTestAppProps = {}) {
  return (story: () => Component, context: { parameters?: InertiaStoryParameters }): Component => {
    const options = context.parameters?.inertia ?? {}

    return defineComponent({
      name: 'InertiaStory',
      render: () =>
        h(
          InertiaTestApp,
          {
            ...defaults,
            ...options,
            page: {
              ...defaults.page,
              ...options.page,
              props: { ...defaults.page?.props, ...options.page?.props },
            } as InertiaTestAppProps['page'],
          },
          { default: () => h(story()) },
        ),
    })
  }
}

export * from '@inertiajs/core/testing'
