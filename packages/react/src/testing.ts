// Public entry for `@inertiajs/react/testing`. Import the adapter's runtime code only through './index',
// so the bundled entry shares the adapter's state instead of bundling a second copy of it.
import { HttpClient, Page, PageProps, TestScope, testScopes } from '@inertiajs/core'
import { createElement, Fragment, ReactElement, ReactNode, useEffect, useRef, useState } from 'react'
import type { InertiaAppProps } from './App'
import { App } from './index'
import type { ReactComponent } from './types'

export interface InertiaTestAppProps<SharedProps extends PageProps = PageProps> {
  /**
   * The page the app starts on. Anything left out gets a sensible default,
   * and `url` decides where the in-memory history starts.
   */
  page?: Partial<Page<SharedProps>>
  /** The component to render for the initial page. Defaults to resolving `page.component`. */
  component?: ReactComponent
  /** Resolves page components by name, needed when the app navigates to other pages. */
  resolve?: (name: string, page?: Page) => ReactComponent | Promise<ReactComponent> | { default: ReactComponent }
  /** Rendered instead of the page component, for stories and tests of a single component. */
  children?: ReactNode
  /**
   * Answers the app's requests, usually a fake server from `createFakeServer()`
   * in `@inertiajs/core/testing`. Without one, requests go to the network as usual.
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

const unwrap = (module: ReactComponent | { default: ReactComponent }): ReactComponent =>
  'default' in module ? module.default : module

/**
 * Renders Inertia without a server. Each app runs in its own isolated scope with in-memory
 * history and session storage, so tests and stories can't affect each other.
 */
export function InertiaTestApp<SharedProps extends PageProps = PageProps>({
  page: pageOverrides,
  component,
  resolve,
  children,
  server,
  titleCallback,
  defaultLayout,
}: InertiaTestAppProps<SharedProps>): ReactElement {
  const owner = useRef({}).current
  const booted = useRef<{ scope: TestScope; page: Page; key: number } | null>(null)

  // The scope has to exist before <App> renders, as that's when the router initializes
  const scope = testScopes.acquire(owner, { url: pageOverrides?.url ?? '/', server })

  if (booted.current?.scope !== scope) {
    // A new scope needs a fresh <App>, as the old one holds the previous scope's page
    booted.current = { scope, page: makePage(pageOverrides as Partial<Page>), key: nextAppKey++ }
  }

  const initialPage = booted.current.page

  // Like createInertiaApp, the initial page component is resolved before the app renders
  const [initialComponent, setInitialComponent] = useState<ReactComponent | null>(() => {
    if (children !== undefined) {
      return Fragment
    }

    if (component || !resolve) {
      return component ?? null
    }

    const resolved = resolve(initialPage.component, initialPage)

    return resolved instanceof Promise ? null : unwrap(resolved)
  })

  useEffect(() => {
    if (!initialComponent && resolve) {
      Promise.resolve(resolve(initialPage.component, initialPage)).then((resolved) =>
        setInitialComponent(() => unwrap(resolved)),
      )
    }
  }, [])

  useEffect(() => {
    testScopes.mount(owner)

    return () => testScopes.release(owner)
  }, [])

  const resolveComponent = async (name: string, page?: Page): Promise<ReactComponent> => {
    if (resolve) {
      return unwrap(await resolve(name, page))
    }

    if (component && name === initialPage.component) {
      return component
    }

    if (children !== undefined) {
      return Fragment
    }

    throw new Error(`Inertia can't resolve the "${name}" page component. Pass a \`resolve\` prop to <InertiaTestApp>.`)
  }

  if (!initialComponent) {
    return createElement(Fragment)
  }

  return createElement(App, {
    key: booted.current.key,
    initialPage,
    initialComponent,
    resolveComponent,
    titleCallback,
    defaultLayout,
    children: children !== undefined ? () => children : undefined,
  } as InertiaAppProps)
}

let nextAppKey = 0

export interface InertiaStoryParameters<SharedProps extends PageProps = PageProps> {
  inertia?: Omit<InertiaTestAppProps<SharedProps>, 'children'>
}

/**
 * A Storybook decorator that renders each story inside its own <InertiaTestApp>.
 * Configure the page per story with `parameters.inertia`.
 */
export function withInertia(defaults: Omit<InertiaTestAppProps, 'children'> = {}) {
  return (Story: () => ReactNode, context: { parameters?: InertiaStoryParameters }): ReactElement => {
    const options = context.parameters?.inertia ?? {}

    return createElement(InertiaTestApp, {
      ...defaults,
      ...options,
      page: { ...defaults.page, ...options.page, props: { ...defaults.page?.props, ...options.page?.props } },
      children: createElement(Story),
    } as InertiaTestAppProps)
  }
}

export * from '@inertiajs/core/testing'
