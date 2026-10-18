import { formDataToObject } from './formObject'
import { http } from './http'
import { HttpCancelledError, HttpResponseError } from './httpErrors'
import { stringifyJson } from './json'
import { page as currentPage } from './page'
import type { Errors, HttpClient, HttpRequestConfig, HttpResponse, Page, PageProps } from './types'
import { hrefToUrl } from './url'

export interface FakeRequest {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete'
  url: URL
  /** The URL's path, without the query string. */
  path: string
  /** Values of the `:name` segments in the route. */
  params: Record<string, string>
  query: URLSearchParams
  /** The request body, or an empty object for requests without one. */
  data: Record<string, any>
  /** Request headers, with lowercase names. */
  headers: Record<string, string>
  /** Whether Inertia made the request, as opposed to `useHttp` or a plain HTTP call. */
  inertia: boolean
  /** The props a partial reload asked for, or `null` for full requests. */
  partial: { component: string; only?: string[]; except?: string[] } | null
  precognitive: boolean
  /** The fields a Precognition request validates, or `null` to validate everything. */
  validateOnly: string[] | null
  errorBag: string | null
}

export interface FakeRequestLog extends FakeRequest {
  /** The status the fake server responded with. */
  status: number
}

/** A page for Inertia to render. Missing fields are filled in from the request. */
export type FakePage = Partial<Omit<Page, 'props'>> & { component: string; props?: PageProps }

export type FakeResult = FakePage | FakeResponse

export type FakeHandler = (request: FakeRequest) => FakeResult | Promise<FakeResult>

/** Routes keyed by `'METHOD /path/:param'`. A key without a method matches GET requests. */
export type FakeRoutes = Record<string, FakeHandler | FakeResult>

export interface FakeServerOptions {
  /** Milliseconds to wait before responding, to see loading states. */
  delay?: number
}

export interface FakeServer extends HttpClient {
  /** Every request the server received, in order. */
  readonly requests: FakeRequestLog[]
  /** Adds a route, or replaces one with the same key. */
  route(key: string, handler: FakeHandler | FakeResult): void
}

type FlashOption = { flash?: Page['flash'] }

const fakeResponse = Symbol('inertia.fakeResponse')
const lazyProp = Symbol('inertia.lazyProp')

type FakeResponse = { [fakeResponse]: true } & (
  | { type: 'redirect'; url: string | null; flash?: Page['flash'] }
  | { type: 'errors'; errors: Errors; flash?: Page['flash'] }
  | { type: 'location'; url: string }
  | { type: 'http'; status: number; data: unknown; headers: Record<string, string> }
)

type LazyProp = { [lazyProp]: 'defer' | 'optional'; resolve: () => unknown; group: string }

/** Redirects to another URL, which the fake server then answers with a GET request. */
export const redirect = (url: string, { flash }: FlashOption = {}): FakeResponse => ({
  [fakeResponse]: true,
  type: 'redirect',
  url,
  flash,
})

/** Redirects back to the page the request came from. */
export const back = ({ flash }: FlashOption = {}): FakeResponse => ({
  [fakeResponse]: true,
  type: 'redirect',
  url: null,
  flash,
})

/**
 * Fails validation. Inertia requests are redirected back with the errors, and
 * Precognition requests receive a 422 response.
 */
export const errors = (errors: Errors, { flash }: FlashOption = {}): FakeResponse => ({
  [fakeResponse]: true,
  type: 'errors',
  errors,
  flash,
})

/** Makes Inertia perform a full page visit, like `Inertia::location()`. */
export const location = (url: string): FakeResponse => ({ [fakeResponse]: true, type: 'location', url })

/** Responds with JSON, for `useHttp` and other plain HTTP requests. */
export const json = (data: unknown, status = 200, headers: Record<string, string> = {}): FakeResponse => ({
  [fakeResponse]: true,
  type: 'http',
  status,
  data: stringifyJson(data),
  headers: { 'content-type': 'application/json', ...headers },
})

/** Responds with anything, such as an HTML error page. */
export const response = ({
  status = 200,
  data = '',
  headers = {},
}: {
  status?: number
  data?: unknown
  headers?: Record<string, string>
}): FakeResponse => ({ [fakeResponse]: true, type: 'http', status, data, headers })

/** A prop that is left out of the first response and loaded right after, like `Inertia::defer()`. */
export const defer = <T>(resolve: () => T, group = 'default'): T =>
  ({ [lazyProp]: 'defer', resolve, group }) satisfies LazyProp as unknown as T

/** A prop that is only included when a partial reload asks for it, like `Inertia::optional()`. */
export const optional = <T>(resolve: () => T): T =>
  ({ [lazyProp]: 'optional', resolve, group: 'default' }) satisfies LazyProp as unknown as T

const isFakeResponse = (value: unknown): value is FakeResponse =>
  typeof value === 'object' && value !== null && fakeResponse in value

const isLazyProp = (value: unknown): value is LazyProp =>
  typeof value === 'object' && value !== null && lazyProp in value

const list = (value: string | undefined): string[] | undefined =>
  value === undefined || value === '' ? undefined : value.split(',')

const normalizeHeaders = (headers: HttpRequestConfig['headers'] = {}): Record<string, string> =>
  Object.fromEntries(
    Object.entries(headers)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key.toLowerCase(), String(value)]),
  )

const parseData = (data: unknown): Record<string, any> => {
  if (data === undefined || data === null || data === '') {
    return {}
  }

  if (typeof FormData !== 'undefined' && data instanceof FormData) {
    return formDataToObject(data)
  }

  if (data instanceof URLSearchParams) {
    return Object.fromEntries(data)
  }

  if (typeof data === 'string') {
    try {
      return JSON.parse(data)
    } catch {
      return { body: data }
    }
  }

  return data as Record<string, any>
}

type CompiledRoute = {
  key: string
  method: string
  pattern: RegExp
  names: string[]
  handler: FakeHandler | FakeResult
}

const compileRoute = (key: string, handler: FakeHandler | FakeResult): CompiledRoute => {
  const [method, path] = key.includes(' ') ? key.split(/\s+/, 2) : ['GET', key]
  const names: string[] = []
  const source = path
    .replace(/\/+$/, '')
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        names.push(segment.slice(1))
        return '([^/]+)'
      }

      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('/')

  return { key, method: method.toLowerCase(), pattern: new RegExp(`^${source}/?$`), names, handler }
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)

    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new HttpCancelledError('Request was cancelled'))
    })
  })

/**
 * An HTTP client that answers requests with route handlers instead of a server,
 * following the Inertia protocol.
 */
export function createFakeServer(routes: FakeRoutes = {}, { delay = 0 }: FakeServerOptions = {}): FakeServer {
  const compiled = new Map<string, CompiledRoute>()
  const requests: FakeRequestLog[] = []

  const route = (key: string, handler: FakeHandler | FakeResult) => {
    compiled.set(key, compileRoute(key, handler))
  }

  Object.entries(routes).forEach(([key, handler]) => route(key, handler))

  const match = (method: string, path: string) => {
    // Like most routers, a static route like /users/create wins over /users/:id
    const candidates = [...compiled.values()].sort((a, b) => a.names.length - b.names.length)

    for (const candidate of candidates) {
      const matches = candidate.method === method ? candidate.pattern.exec(path) : null

      if (matches) {
        const params = Object.fromEntries(
          candidate.names.map((name, index) => [name, decodeURIComponent(matches[index + 1])]),
        )

        return { route: candidate, params }
      }
    }

    return null
  }

  const createRequest = (config: HttpRequestConfig, method: FakeRequest['method'], url: URL): FakeRequest => {
    const headers = normalizeHeaders(config.headers)
    const partialComponent = headers['x-inertia-partial-component']

    return {
      method,
      url,
      path: url.pathname,
      params: {},
      query: url.searchParams,
      data: parseData(config.data),
      headers,
      inertia: headers['x-inertia'] === 'true',
      partial: partialComponent
        ? {
            component: partialComponent,
            only: list(headers['x-inertia-partial-data']),
            except: list(headers['x-inertia-partial-except']),
          }
        : null,
      precognitive: headers['precognition'] === 'true',
      validateOnly: list(headers['precognition-validate-only']) ?? null,
      errorBag: headers['x-inertia-error-bag'] || null,
    }
  }

  const httpResponse = (status: number, data: unknown, headers: Record<string, string> = {}): HttpResponse => ({
    status,
    data: typeof data === 'string' ? data : stringifyJson(data),
    headers,
  })

  const renderPage = (request: FakeRequest, result: FakePage, flash?: Page['flash']): HttpResponse => {
    const partial = request.partial?.component === result.component ? request.partial : null
    const deferredProps: Record<string, string[]> = {}
    const props: PageProps = {}

    Object.entries(result.props ?? {}).forEach(([key, value]) => {
      if (partial) {
        const requested = partial.only ? partial.only.includes(key) : true
        const excepted = partial.except?.includes(key) ?? false

        if (!requested || excepted) {
          return
        }
      } else if (isLazyProp(value)) {
        if (value[lazyProp] === 'defer') {
          deferredProps[value.group] = [...(deferredProps[value.group] ?? []), key]
        }

        return
      }

      const resolved = isLazyProp(value) ? value.resolve() : value
      props[key] = typeof resolved === 'function' ? resolved() : resolved
    })

    const page: Page = {
      url: request.url.pathname + request.url.search,
      version: request.headers['x-inertia-version'] ?? null,
      rescuedProps: [],
      rememberedState: {},
      ...result,
      flash: { ...result.flash, ...flash },
      props: { ...props, errors: (result.props?.errors as Page['props']['errors']) ?? {} },
      ...(Object.keys(deferredProps).length > 0 ? { deferredProps } : {}),
    }

    return httpResponse(200, stringifyJson(page), {
      'x-inertia': 'true',
      'content-type': 'application/json',
      vary: 'X-Inertia',
    })
  }

  const respondTo = async (request: FakeRequest, result: FakeResult): Promise<HttpResponse> => {
    if (request.precognitive) {
      if (isFakeResponse(result) && result.type === 'errors') {
        const relevant = request.validateOnly
          ? Object.fromEntries(Object.entries(result.errors).filter(([key]) => request.validateOnly!.includes(key)))
          : result.errors

        if (Object.keys(relevant).length > 0) {
          return httpResponse(422, stringifyJson({ message: 'The given data was invalid.', errors: relevant }), {
            precognition: 'true',
            'content-type': 'application/json',
          })
        }
      }

      // Passing validation stops a Precognition request before the route does anything else
      return httpResponse(204, '', { precognition: 'true', 'precognition-success': 'true' })
    }

    if (!isFakeResponse(result)) {
      return request.inertia || typeof result.component === 'string'
        ? renderPage(request, result)
        : httpResponse(200, stringifyJson(result), { 'content-type': 'application/json' })
    }

    switch (result.type) {
      case 'http':
        return httpResponse(result.status, result.data, result.headers)
      case 'location':
        return request.inertia
          ? httpResponse(409, '', { 'x-inertia-location': result.url })
          : httpResponse(302, '', { location: result.url })
      case 'redirect':
        return follow(request, result.url ?? currentPage.get().url, result.flash)
      case 'errors': {
        const errors = (
          request.errorBag ? { [request.errorBag]: result.errors } : result.errors
        ) as Page['props']['errors']

        if (!request.inertia) {
          return httpResponse(422, stringifyJson({ message: 'The given data was invalid.', errors }), {
            'content-type': 'application/json',
          })
        }

        return follow(request, currentPage.get().url, result.flash, errors)
      }
    }
  }

  // Browsers follow redirects transparently, so the client only ever sees the final GET response
  const follow = async (
    original: FakeRequest,
    to: string,
    flash?: Page['flash'],
    errors?: Page['props']['errors'],
  ): Promise<HttpResponse> => {
    const url = new URL(to, original.url)
    const request: FakeRequest = {
      ...createRequest({ method: 'get', url: url.href, headers: {} }, 'get', url),
      headers: Object.fromEntries(
        Object.entries(original.headers).filter(
          ([key]) => !key.startsWith('x-inertia-partial') && key !== 'content-type',
        ),
      ),
      inertia: original.inertia,
    }

    const matched = match('get', url.pathname.replace(/\/+$/, '') || '/')
    const current = currentPage.get()
    const result: FakeResult | null = matched
      ? await resolveResult(matched.route.handler, { ...request, params: matched.params })
      : current && hrefToUrl(current.url).href === url.href
        ? // Without a route for the page we came from, render it again as it is
          { ...current, props: { ...current.props } }
        : null

    log(request, result ? 200 : 404)

    if (!result) {
      return notFound(request)
    }

    if (errors && !isFakeResponse(result)) {
      return renderPage(request, { ...result, props: { ...result.props, errors } }, flash)
    }

    return isFakeResponse(result) ? respondTo(request, result) : renderPage(request, result, flash)
  }

  const resolveResult = async (handler: FakeHandler | FakeResult, request: FakeRequest): Promise<FakeResult> =>
    typeof handler === 'function' ? handler(request) : handler

  const notFound = (request: FakeRequest): HttpResponse =>
    httpResponse(
      404,
      `No route in the fake server matches ${request.method.toUpperCase()} ${request.path}. Routes: ${
        [...compiled.keys()].join(', ') || 'none'
      }`,
      { 'content-type': 'text/plain' },
    )

  const log = (request: FakeRequest, status: number) => {
    requests.push({ ...request, status })
  }

  const handle = async (config: HttpRequestConfig): Promise<HttpResponse> => {
    if (config.signal?.aborted) {
      throw new HttpCancelledError('Request was cancelled', config.url)
    }

    if (delay > 0) {
      await wait(delay, config.signal)
    }

    const method = config.method.toLowerCase() as FakeRequest['method']
    const url = hrefToUrl(config.url)

    Object.entries(config.params ?? {}).forEach(([key, value]) => url.searchParams.set(key, String(value)))

    const request = createRequest(config, method, url)
    const matched = match(method, url.pathname.replace(/\/+$/, '') || '/')
    const entry: FakeRequestLog = { ...request, status: 404 }

    requests.push(entry)

    if (!matched) {
      return notFound(request)
    }

    const result = await resolveResult(matched.route.handler, { ...request, params: matched.params })
    entry.params = matched.params

    if (config.signal?.aborted) {
      throw new HttpCancelledError('Request was cancelled', config.url)
    }

    const response = await respondTo({ ...request, params: matched.params }, result)
    entry.status =
      request.inertia && !request.precognitive && isFakeResponse(result) && ['redirect', 'errors'].includes(result.type)
        ? ['put', 'patch', 'delete'].includes(method)
          ? 303
          : 302
        : response.status

    return response
  }

  return {
    requests,
    route,
    async request(config) {
      const processed = await http.processRequest(config)

      try {
        const response = await handle(processed)

        if (response.status >= 400) {
          throw new HttpResponseError(`Request failed with status ${response.status}`, response, processed.url)
        }

        return await http.processResponse(response)
      } catch (error) {
        if (error instanceof HttpResponseError || error instanceof HttpCancelledError) {
          await http.processError(error)
        }

        throw error
      }
    },
  }
}
