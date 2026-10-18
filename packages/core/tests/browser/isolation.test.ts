import { afterEach, describe, expect, it, vi } from 'vitest'
import { config, http, router } from '../../src'
import { createTestScope, type TestScope } from '../../src/testing'
import { boot, deferredClient, flush, inertiaResponse, makePage } from './helpers'

let scope: TestScope | null = null

const startScope = (url = '/') => {
  scope?.dispose()
  scope = createTestScope({ url })

  return scope
}

afterEach(() => {
  scope?.dispose()
  scope = null
})

describe('test scope isolation', () => {
  it('starts each scope with the page it was given', async () => {
    startScope('/a')
    boot(makePage({ component: 'A', url: '/a', props: { errors: {}, fromA: true } }))
    router.push({ component: 'A2', url: '/a/2' })
    await flush()

    startScope('/b')
    const { swaps } = boot(makePage({ component: 'B', url: '/b' }))
    await flush()

    router.replaceProp('count', 1)
    await flush()

    expect(swaps.at(-1)).toMatchObject({ component: 'B', url: '/b', props: { count: 1 } })
    expect(swaps.at(-1)!.props).not.toHaveProperty('fromA')
  })

  it('removes event listeners registered in a previous scope', async () => {
    const navigatedInA = vi.fn()

    startScope('/a')
    boot(makePage({ component: 'A', url: '/a' }))
    router.on('navigate', navigatedInA)
    await flush()
    navigatedInA.mockClear()

    startScope('/b')
    boot(makePage({ component: 'B', url: '/b' }))
    router.push({ component: 'B2', url: '/b/2' })
    await flush()

    expect(navigatedInA).not.toHaveBeenCalled()
  })

  it('cancels requests that are still in flight when the scope is disposed', async () => {
    const { client, pending } = deferredClient()
    const onSuccess = vi.fn()

    startScope('/a')
    http.setClient(client)
    boot(makePage({ component: 'A', url: '/a' }))
    router.visit('/a/slow', { onSuccess })
    await flush()

    const [request] = pending

    startScope('/b')
    const { swaps } = boot(makePage({ component: 'B', url: '/b' }))
    await flush()

    request.respond(inertiaResponse(makePage({ component: 'Slow', url: '/a/slow' })))
    await flush()

    expect(request.config.signal?.aborted).toBe(true)
    expect(onSuccess).not.toHaveBeenCalled()
    expect(swaps.map((page) => page.component)).toEqual(['B'])
  })

  it('ignores a response the previous scope was still processing', async () => {
    let resolveComponent!: () => void
    const onSuccess = vi.fn()

    startScope('/a')
    http.setClient({ request: async () => inertiaResponse(makePage({ component: 'Slow', url: '/a/slow' })) })
    router.init({
      initialPage: makePage({ component: 'A', url: '/a' }),
      resolveComponent: (name: string) =>
        name === 'Slow' ? new Promise((resolve) => (resolveComponent = () => resolve(name))) : name,
      swapComponent: async () => {},
    })
    await flush()
    router.visit('/a/slow', { onSuccess })
    await flush()

    startScope('/b')
    const { swaps } = boot(makePage({ component: 'B', url: '/b' }))
    await flush()

    resolveComponent()
    await flush()

    expect(onSuccess).not.toHaveBeenCalled()
    expect(swaps.map((page) => page.component)).toEqual(['B'])
    expect(scope!.history.url).toBe(`${window.location.origin}/b`)
  })

  it('stops polls started in a previous scope', async () => {
    const { client, pending } = deferredClient()

    startScope('/a')
    http.setClient(client)
    boot(makePage({ component: 'A', url: '/a' }))
    router.poll(10)
    await flush(30)

    startScope('/b')
    const requestsBefore = pending.length
    boot(makePage({ component: 'B', url: '/b' }))
    await flush(50)

    expect(requestsBefore).toBeGreaterThan(0)
    expect(pending.length).toBe(requestsBefore)
    expect(router.activePolls).toBe(0)
  })

  it('clears the prefetch cache of a previous scope', async () => {
    startScope('/a')
    http.setClient({ request: async () => inertiaResponse(makePage({ component: 'Users', url: '/users' })) })
    boot(makePage({ component: 'A', url: '/a' }))
    router.prefetch('/users')
    await flush()
    expect(router.getCached('/users')).not.toBeNull()

    startScope('/b')
    boot(makePage({ component: 'B', url: '/b' }))

    expect(router.getCached('/users')).toBeNull()
  })

  it('forgets remembered state from a previous scope', async () => {
    startScope('/a')
    boot(makePage({ component: 'A', url: '/a' }))
    await flush()
    router.remember({ draft: 'from a' }, 'form')
    await flush()

    startScope('/a')
    boot(makePage({ component: 'A', url: '/a' }))
    await flush()

    expect(router.restore('form')).toBeUndefined()
  })

  it('restores config and HTTP setup changed inside a scope', async () => {
    const outerClient = http.getClient()
    const cacheFor = config.get('prefetch.cacheFor')
    const { client, pending } = deferredClient()

    startScope('/a')
    http.setClient({ request: async () => inertiaResponse(makePage()) })
    http.onRequest((request) => ({ ...request, headers: { ...request.headers, 'X-From-A': 'yes' } }))
    config.set('prefetch.cacheFor', 1)
    scope!.dispose()

    expect(http.getClient()).toBe(outerClient)
    expect(config.get('prefetch.cacheFor')).toBe(cacheFor)

    const processed = await http.processRequest({ method: 'get', url: '/', headers: {} })
    expect(processed.headers).not.toHaveProperty('X-From-A')

    startScope('/b')
    http.setClient(client)
    boot(makePage({ component: 'B', url: '/b' }))
    router.visit('/b/2')
    await flush()

    expect(pending).toHaveLength(1)
  })

  it('refuses to create a second scope while one is active', () => {
    startScope('/a')

    expect(() => createTestScope({ url: '/b' })).toThrow(/already active/)
  })

  it('can be disposed more than once', () => {
    const first = startScope('/a')
    first.dispose()
    first.dispose()

    const second = startScope('/b')
    first.dispose()

    expect(() => createTestScope()).toThrow(/already active/)
    second.dispose()
  })
})
