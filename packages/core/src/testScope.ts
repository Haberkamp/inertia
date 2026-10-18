import { config } from './config'
import { environment, MemoryHistory, MemoryStorage } from './environment'
import { eventHandler } from './eventHandler'
import { history } from './history'
import { http } from './http'
import { httpHandlers } from './httpHandlers'
import { resetInfiniteScrollQueryString } from './infiniteScroll/queryString'
import { page } from './page'
import { polls } from './polls'
import { prefetchedRequests } from './prefetched'
import { progress } from './progress'
import { Response } from './response'
import type { Router } from './router'

export interface TestScopeOptions {
  /** The URL the scope starts on. Relative URLs resolve against the current origin. Defaults to `/`. */
  url?: string
}

export interface TestScope {
  /** The in-memory history the scope navigates in. */
  readonly history: MemoryHistory
  /** The in-memory session storage the scope uses. */
  readonly sessionStorage: Storage
  /** Tears the scope down and restores Inertia's state from before the scope started. Safe to call twice. */
  dispose(): void
}

let activeScope: TestScope | null = null
const resetCallbacks = new Set<VoidFunction>()

/**
 * @internal Lets adapters reset their own module state whenever a test scope starts or ends.
 */
export function onTestScopeReset(callback: VoidFunction): VoidFunction {
  resetCallbacks.add(callback)

  return () => resetCallbacks.delete(callback)
}

/**
 * @internal The scope that is currently active, if any.
 */
export function activeTestScope(): TestScope | null {
  return activeScope
}

const resetState = (router: Router) => {
  // Listeners go first, so nothing from the previous scope hears its own requests being cancelled
  eventHandler.reset()
  router.reset()
  polls.clear()
  prefetchedRequests.removeAll()
  history.reset()
  page.reset()
  Response.reset()
  resetInfiniteScrollQueryString()
  progress.hideCount = 0
  resetCallbacks.forEach((callback) => callback())
}

/**
 * @internal Use `createTestScope` from `@inertiajs/core/testing` instead.
 */
export function createTestScope(router: Router, { url = '/' }: TestScopeOptions = {}): TestScope {
  if (activeScope) {
    throw new Error(
      'An Inertia test scope is already active. Dispose it before creating another one. ' +
        'Inertia can only isolate one app per page, so render stories and tests that run at the same time in separate iframes.',
    )
  }

  const restoreConfig = config.snapshot()
  const restoreHttpHandlers = httpHandlers.snapshot()
  const httpClient = http.getClient()
  const memoryHistory = new MemoryHistory(url)
  const sessionStorage = new MemoryStorage()

  environment.use({ history: memoryHistory, sessionStorage })
  resetState(router)

  const scope: TestScope = {
    history: memoryHistory,
    sessionStorage,
    dispose() {
      if (activeScope !== scope) {
        return
      }

      activeScope = null
      memoryHistory.dispose()
      environment.restore()
      resetState(router)
      restoreConfig()
      restoreHttpHandlers()
      http.setClient(httpClient)
    },
  }

  activeScope = scope

  return scope
}

type ScopeOwnership = {
  owner: object
  scope: TestScope
  mounted: boolean
  releaseTimer: ReturnType<typeof setTimeout> | null
}

let ownership: ScopeOwnership | null = null

const disposeOwnedScope = () => {
  if (ownership) {
    ownership.releaseTimer && clearTimeout(ownership.releaseTimer)
    ownership.scope.dispose()
    ownership = null
  }
}

/**
 * @internal Lets the adapters' test components own a scope across their lifecycle. Components
 * acquire the scope while rendering (before the router initializes), mark it mounted once
 * they're on screen, and release it when they unmount. Releasing is deferred a tick, so
 * frameworks that remount right away (like React's Strict Mode) keep the same scope.
 */
export const testScopeOwnership = {
  acquire(router: Router, owner: object, options: TestScopeOptions): TestScope {
    if (ownership?.owner === owner) {
      return ownership.scope
    }

    if (ownership && (!ownership.mounted || ownership.releaseTimer)) {
      // The previous owner never made it on screen, or is on its way out
      disposeOwnedScope()
    }

    const scope = createTestScope(router, options)

    ownership = { owner, scope, mounted: false, releaseTimer: null }

    return scope
  },

  mount(owner: object): void {
    if (ownership?.owner === owner) {
      ownership.mounted = true
      ownership.releaseTimer && clearTimeout(ownership.releaseTimer)
      ownership.releaseTimer = null
    }
  },

  release(owner: object): void {
    if (ownership?.owner === owner && !ownership.releaseTimer) {
      ownership.releaseTimer = setTimeout(disposeOwnedScope)
    }
  },
}
