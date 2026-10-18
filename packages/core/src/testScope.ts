import { environment, MemoryHistory, MemoryStorage } from './environment'
import { eventHandler } from './eventHandler'

export interface TestScopeOptions {
  /** The URL the scope starts on. Relative URLs resolve against the current origin. Defaults to `/`. */
  url?: string
}

export interface TestScope {
  /** The in-memory history the scope navigates in. */
  readonly history: MemoryHistory
  /** The in-memory session storage the scope uses. */
  readonly sessionStorage: Storage
  /** Tears the scope down and restores Inertia's default, browser-backed state. Safe to call twice. */
  dispose(): void
}

let activeScope: TestScope | null = null

/**
 * @internal Use `createTestScope` from `@inertiajs/core/testing` instead.
 */
export function createTestScope({ url = '/' }: TestScopeOptions = {}): TestScope {
  if (activeScope) {
    throw new Error(
      'An Inertia test scope is already active. Dispose it before creating another one. ' +
        'Inertia can only isolate one app per page, render stories and tests that run at the same time in separate iframes.',
    )
  }

  const history = new MemoryHistory(url)
  const sessionStorage = new MemoryStorage()

  environment.use({ history, sessionStorage })
  eventHandler.reset()

  const scope: TestScope = {
    history,
    sessionStorage,
    dispose() {
      if (activeScope !== scope) {
        return
      }

      eventHandler.reset()
      history.dispose()
      environment.restore()
      activeScope = null
    },
  }

  activeScope = scope

  return scope
}
