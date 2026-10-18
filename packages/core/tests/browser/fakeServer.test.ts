import { client as precognition } from 'laravel-precognition'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { http, router } from '../../src'
import {
  back,
  createFakeServer,
  createTestScope,
  defer,
  errors,
  json,
  location,
  optional,
  redirect,
  type FakeServer,
  type TestScope,
} from '../../src/testing'
import type { Page } from '../../src/types'
import { boot, flush, makePage } from './helpers'

let scope: TestScope | null = null

const start = (server: FakeServer, initialPage: Page) => {
  scope = createTestScope({ url: initialPage.url, server })

  return boot(initialPage)
}

afterEach(() => {
  scope?.dispose()
  scope = null
  document.querySelectorAll('dialog, iframe').forEach((element) => element.remove())
})

const origin = window.location.origin

describe('fake server', () => {
  it('answers visits with the page returned by the matching route', async () => {
    const server = createFakeServer({
      'GET /users/:id': ({ params, query }) => ({
        component: 'Users/Show',
        props: { id: params.id, tab: query.get('tab') },
      }),
    })

    const { swaps } = start(server, makePage({ component: 'Home', url: '/' }))
    router.visit('/users/7?tab=posts')
    await flush()

    expect(swaps.at(-1)).toMatchObject({
      component: 'Users/Show',
      url: '/users/7?tab=posts',
      props: { id: '7', tab: 'posts', errors: {} },
    })
    expect(scope!.history.url).toBe(`${origin}/users/7?tab=posts`)
    expect(server.requests).toMatchObject([{ method: 'get', path: '/users/7', inertia: true }])
  })

  it('follows redirects like the browser does', async () => {
    const server = createFakeServer({
      'POST /users': redirect('/users/1'),
      'GET /users/:id': ({ params }) => ({ component: 'Users/Show', props: { id: params.id } }),
    })

    const { swaps } = start(server, makePage({ component: 'Users/Create', url: '/users/create' }))
    router.post('/users', { name: 'Taylor' })
    await flush()

    expect(swaps.at(-1)).toMatchObject({ component: 'Users/Show', url: '/users/1', props: { id: '1' } })
    expect(server.requests.map((request) => [request.method, request.path, request.data])).toEqual([
      ['post', '/users', { name: 'Taylor' }],
      ['get', '/users/1', {}],
    ])
  })

  it('redirects back with validation errors', async () => {
    const onError = vi.fn()
    const onSuccess = vi.fn()
    const server = createFakeServer({
      'POST /users': ({ data }) => (data.name ? back() : errors({ name: 'The name field is required.' })),
    })

    const { swaps } = start(
      server,
      makePage({ component: 'Users/Create', url: '/users/create', props: { errors: {}, roles: ['admin'] } }),
    )
    router.post('/users', { name: '' }, { onError, onSuccess })
    await flush()

    expect(onSuccess).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith({ name: 'The name field is required.' })
    expect(swaps.at(-1)).toMatchObject({
      component: 'Users/Create',
      url: '/users/create',
      props: { roles: ['admin'], errors: { name: 'The name field is required.' } },
    })
  })

  it('nests validation errors under the requested error bag', async () => {
    const onError = vi.fn()
    const server = createFakeServer({ 'POST /login': errors({ email: 'Invalid.' }) })

    const { swaps } = start(server, makePage({ component: 'Login', url: '/login' }))
    router.post('/login', {}, { errorBag: 'login', onError })
    await flush()

    expect(swaps.at(-1)!.props.errors).toEqual({ login: { email: 'Invalid.' } })
    expect(onError).toHaveBeenCalledWith({ email: 'Invalid.' })
  })

  it('records full page visits instead of leaving the page', async () => {
    const href = window.location.href
    const server = createFakeServer({ 'GET /billing': location('https://billing.example.com/portal') })

    start(server, makePage({ component: 'Home', url: '/' }))
    router.visit('/billing')
    await flush()

    expect(scope!.history.fullPageVisits).toEqual(['https://billing.example.com/portal'])
    expect(window.location.href).toBe(href)
  })

  it('leaves deferred props out of the first response and loads them afterwards', async () => {
    const server = createFakeServer({
      'GET /dashboard': {
        component: 'Dashboard',
        props: { user: 'Taylor', stats: defer(() => ({ visits: 10 })), feed: defer(() => ['post'], 'feed') },
      },
    })

    const { swaps } = start(server, makePage({ component: 'Home', url: '/' }))
    router.visit('/dashboard')
    await flush(50)

    expect(swaps.find((page) => page.component === 'Dashboard')!.props).toEqual({ user: 'Taylor', errors: {} })
    expect(swaps.at(-1)!.props).toEqual({ user: 'Taylor', stats: { visits: 10 }, feed: ['post'], errors: {} })
    expect(server.requests.map((request) => request.partial?.only)).toEqual([undefined, ['stats'], ['feed']])
  })

  it('only evaluates the props a partial reload asks for', async () => {
    const users = vi.fn(() => ['Taylor'])
    const roles = vi.fn(() => ['admin'])
    const server = createFakeServer({
      'GET /users': { component: 'Users/Index', props: { users, roles, filters: optional(() => ({ q: 'a' })) } },
    })

    const { swaps } = start(server, makePage({ component: 'Users/Index', url: '/users', props: { errors: {} } }))
    router.reload({ only: ['filters'] })
    await flush()

    expect(users).not.toHaveBeenCalled()
    expect(roles).not.toHaveBeenCalled()
    expect(swaps.at(-1)!.props).toMatchObject({ filters: { q: 'a' } })

    router.reload({ except: ['roles'] })
    await flush()

    expect(roles).not.toHaveBeenCalled()
    expect(swaps.at(-1)!.props).toMatchObject({ users: ['Taylor'] })
    expect(swaps.at(-1)!.props).toMatchObject({ filters: { q: 'a' } })
  })

  it('answers plain HTTP requests with JSON', async () => {
    const server = createFakeServer({
      'GET /api/stats': json({ visits: 10 }),
      'POST /api/stats': json({ message: 'Invalid.', errors: { range: 'Invalid.' } }, 422),
    })

    start(server, makePage())

    const response = await http.getClient().request({ method: 'get', url: '/api/stats' })
    expect(JSON.parse(response.data)).toEqual({ visits: 10 })

    await expect(http.getClient().request({ method: 'post', url: '/api/stats', data: {} })).rejects.toMatchObject({
      response: { status: 422 },
    })
  })

  it('responds with a 404 to requests without a route', async () => {
    const onHttpException = vi.fn(() => false as const)
    const server = createFakeServer({})

    start(server, makePage())
    router.visit('/missing', { onHttpException })
    await flush()

    expect(onHttpException).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }))
    expect(server.requests).toMatchObject([{ path: '/missing', status: 404 }])
  })

  it('cancels a request that is aborted while the route is still responding', async () => {
    const onSuccess = vi.fn()
    const server = createFakeServer({ 'GET /slow': { component: 'Slow' } }, { delay: 50 })

    const { swaps } = start(server, makePage())
    router.visit('/slow', { onSuccess })
    await flush(10)
    router.cancelAll()
    await flush(80)

    expect(onSuccess).not.toHaveBeenCalled()
    expect(swaps.map((page) => page.component)).toEqual(['Home'])
  })

  it('answers Precognition requests', async () => {
    const server = createFakeServer({
      'POST /users': ({ data }) => (data.name ? redirect('/users/1') : errors({ name: 'The name field is required.' })),
    })

    start(server, makePage({ component: 'Users/Create', url: '/users/create' }))

    const onValidationError = vi.fn((response) => response.data.errors)
    await precognition.post('/users', { name: '' }, { validate: ['name'], onValidationError })
    expect(onValidationError).toHaveReturnedWith({ name: 'The name field is required.' })

    const onPrecognitionSuccess = vi.fn()
    await precognition.post('/users', { name: 'Taylor' }, { validate: ['name'], onPrecognitionSuccess })
    expect(onPrecognitionSuccess).toHaveBeenCalled()

    expect(server.requests).toMatchObject([
      { method: 'post', path: '/users', precognitive: true, validateOnly: ['name'], data: { name: '' } },
      { method: 'post', path: '/users', precognitive: true, data: { name: 'Taylor' } },
    ])
  })

  it('stops answering Precognition requests once the scope is disposed', async () => {
    const fetch = window.fetch

    start(createFakeServer({}), makePage())
    expect(window.fetch).not.toBe(fetch)

    scope!.dispose()
    expect(window.fetch).toBe(fetch)
  })
})
