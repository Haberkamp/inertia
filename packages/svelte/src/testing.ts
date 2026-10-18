import type { PageProps } from '@inertiajs/core'
import InertiaTestApp from './components/InertiaTestApp.svelte'
import type { InertiaTestAppProps } from './components/InertiaTestApp.svelte'

export { default as InertiaTestApp, type InertiaTestAppProps } from './components/InertiaTestApp.svelte'
export * from '@inertiajs/core/testing'

export interface InertiaStoryParameters<SharedProps extends PageProps = PageProps> {
  inertia?: Omit<InertiaTestAppProps<SharedProps>, 'children'>
}

/**
 * A Storybook decorator that renders each story inside its own <InertiaTestApp>.
 * Configure the page per story with `parameters.inertia`.
 */
export function withInertia(defaults: Omit<InertiaTestAppProps, 'children'> = {}) {
  return (_story: unknown, context: { parameters?: InertiaStoryParameters }) => {
    const options = context.parameters?.inertia ?? {}

    return {
      Component: InertiaTestApp,
      props: {
        ...defaults,
        ...options,
        page: { ...defaults.page, ...options.page, props: { ...defaults.page?.props, ...options.page?.props } },
      } as InertiaTestAppProps,
    }
  }
}
