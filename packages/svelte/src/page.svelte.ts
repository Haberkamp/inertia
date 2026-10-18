import { onTestScopeReset, type Page, type PageProps, type SharedPageProps } from '@inertiajs/core'
import { resetLayoutProps } from './layoutProps.svelte'

type SveltePage<TPageProps extends PageProps = PageProps> = Omit<Page<TPageProps & SharedPageProps>, 'props'> & {
  props: Page<TPageProps & SharedPageProps>['props'] & {
    [key: string]: any
  }
}

const page = $state<SveltePage>({
  component: '',
  props: {},
  url: '',
  version: null,
} as SveltePage)

export function setPage(newPage: SveltePage) {
  Object.assign(page, newPage)
}

// Each test scope mounts its own app, so nothing from the previous page may linger
onTestScopeReset(() => {
  Object.keys(page).forEach((key) => delete page[key as keyof SveltePage])
  Object.assign(page, { component: '', props: {}, url: '', version: null })
  resetLayoutProps()
})

export function usePage<TPageProps extends PageProps = PageProps>(): SveltePage<TPageProps> {
  return page as SveltePage<TPageProps>
}

export default page
