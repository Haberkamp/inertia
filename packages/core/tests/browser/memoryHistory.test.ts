import { afterEach, describe, expect, it } from 'vitest'
import { http, router } from '../../src'
import { createTestScope, type TestScope } from '../../src/testing'
import { boot, deferredClient, flush, makePage } from './helpers'

let scope: TestScope | null = null

afterEach(() => {
  scope?.dispose()
  scope = null
})

describe('memory history', () => {
  it('navigates without touching the browser history or location', async () => {
    const href = window.location.href
    const length = window.history.length
    const state = window.history.state

    scope = createTestScope({ url: '/users' })
    boot(makePage({ component: 'Users/Index', url: '/users' }))
    await flush()

    router.push({ component: 'Users/Show', url: '/users/1' })
    await flush()

    expect(scope.history.url).toBe(`${window.location.origin}/users/1`)
    expect(scope.history.length).toBe(2)
    expect(window.location.href).toBe(href)
    expect(window.history.length).toBe(length)
    expect(window.history.state).toEqual(state)
  })

  it('restores the previous page when going back', async () => {
    scope = createTestScope({ url: '/users' })
    const { swaps } = boot(makePage({ component: 'Users/Index', url: '/users', props: { errors: {}, page: 1 } }))
    await flush()

    router.push({ component: 'Users/Show', url: '/users/1' })
    await flush()

    scope.history.back()
    await flush()

    expect(scope.history.url).toBe(`${window.location.origin}/users`)
    expect(swaps.at(-1)).toMatchObject({ component: 'Users/Index', props: { page: 1 } })

    scope.history.forward()
    await flush()

    expect(swaps.at(-1)).toMatchObject({ component: 'Users/Show' })
  })

  it('resolves relative URLs and reloads against the memory location', async () => {
    const { client, pending } = deferredClient()

    scope = createTestScope({ url: '/users?page=2' })
    http.setClient(client)
    boot(makePage({ component: 'Users/Index', url: '/users?page=2' }))
    await flush()

    router.reload()
    router.visit('details')
    await flush()

    expect(pending.map((request) => request.config.url)).toEqual([
      `${window.location.origin}/users?page=2`,
      `${window.location.origin}/details`,
    ])
  })

  it('keeps encryption keys and remembered state out of the browser session storage', async () => {
    window.sessionStorage.clear()

    scope = createTestScope({ url: '/secret' })
    boot(makePage({ component: 'Secret', url: '/secret', encryptHistory: true }))
    await flush()

    router.push({ component: 'Secret', url: '/secret/2', encryptHistory: true })
    await flush()

    router.remember({ draft: 'hello' }, 'form')
    await flush()

    expect(window.sessionStorage.length).toBe(0)
    expect(router.restore('form')).toEqual({ draft: 'hello' })
  })
})
