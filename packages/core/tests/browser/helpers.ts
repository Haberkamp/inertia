import { router } from '../../src'
import { HttpCancelledError } from '../../src/httpErrors'
import type { HttpClient, HttpRequestConfig, HttpResponse, Page } from '../../src/types'

export const makePage = (overrides: Partial<Page> = {}): Page => ({
  component: 'Home',
  props: { errors: {} },
  url: '/home',
  version: '1',
  flash: {},
  rescuedProps: [],
  rememberedState: {},
  ...overrides,
})

export const boot = (initialPage: Page) => {
  const swaps: Page[] = []

  router.init({
    initialPage,
    resolveComponent: (name: string) => name,
    swapComponent: async ({ page }) => {
      swaps.push(page)
    },
  })

  return { swaps }
}

export const inertiaResponse = (page: Page, status = 200): HttpResponse => ({
  status,
  data: JSON.stringify(page),
  headers: { 'x-inertia': 'true', 'content-type': 'application/json' },
})

type PendingRequest = {
  config: HttpRequestConfig
  respond: (response: HttpResponse) => void
}

/**
 * An HTTP client that holds every request until the test responds to it, and
 * rejects with a cancellation error when the request is aborted.
 */
export const deferredClient = () => {
  const pending: PendingRequest[] = []

  const client: HttpClient = {
    request: (config) =>
      new Promise<HttpResponse>((resolve, reject) => {
        config.signal?.addEventListener('abort', () =>
          reject(new HttpCancelledError('Request was cancelled', config.url)),
        )
        pending.push({ config, respond: resolve })
      }),
  }

  return { client, pending }
}

export const flush = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms))
