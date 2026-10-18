import { get } from 'es-toolkit/compat'
import debounce from './debounce'
import { environment, MemoryHistory } from './environment'
import { fireNavigateEvent } from './events'
import { history } from './history'
import { router } from './index'
import { page as currentPage } from './page'
import { Scroll } from './scroll'
import { GlobalEvent, GlobalEventNames, GlobalEventResult, InternalEvent } from './types'
import { hrefToUrl } from './url'

class EventHandler {
  protected internalListeners: {
    event: InternalEvent
    listener: (...args: any[]) => void
  }[] = []

  protected teardowns = new Set<VoidFunction>()

  public init() {
    const historyEnvironment = environment.history()

    if (historyEnvironment instanceof MemoryHistory) {
      historyEnvironment.onPopstate((state) => this.handlePopstateEvent({ state } as PopStateEvent))
      this.teardowns.add(() => historyEnvironment.onPopstate(null))
    } else if (typeof window !== 'undefined') {
      this.addListener(window, 'popstate', this.handlePopstateEvent.bind(this))
      this.addListener(window, 'pageshow', this.handlePageshowEvent.bind(this))
    }

    if (typeof window !== 'undefined') {
      this.addListener(window, 'scroll', debounce(Scroll.onWindowScroll.bind(Scroll), 100), true)
    }

    if (typeof document !== 'undefined') {
      this.addListener(document, 'scroll', debounce(Scroll.onScroll.bind(Scroll), 100), true)
    }
  }

  /**
   * Removes every listener registered since the last reset. Only used when
   * switching between isolated test scopes.
   */
  public reset(): void {
    this.teardowns.forEach((teardown) => teardown())
    this.teardowns.clear()
    this.internalListeners = []
  }

  protected addListener(target: EventTarget, type: string, listener: (event: any) => void, capture = false): void {
    target.addEventListener(type, listener, capture)
    this.teardowns.add(() => target.removeEventListener(type, listener, capture))
  }

  public onGlobalEvent<TEventName extends GlobalEventNames>(
    type: TEventName,
    callback: (event: GlobalEvent<TEventName>) => GlobalEventResult<TEventName>,
  ): VoidFunction {
    const listener = ((event: GlobalEvent<TEventName>) => {
      const response = callback(event)

      if (event.cancelable && !event.defaultPrevented && response === false) {
        event.preventDefault()
      }
    }) as EventListener

    return this.registerListener(`inertia:${type}`, listener)
  }

  public on(event: InternalEvent, callback: (...args: any[]) => void): VoidFunction {
    this.internalListeners.push({ event, listener: callback })

    return () => {
      this.internalListeners = this.internalListeners.filter((listener) => listener.listener !== callback)
    }
  }

  public onMissingHistoryItem() {
    // At this point, the user has probably cleared the state
    // Mark the current page as cleared so that we don't try to write anything to it.
    currentPage.clear()
    // Fire an event so that that any listeners can handle this situation
    this.fireInternalEvent('missingHistoryItem')
  }

  public fireInternalEvent(event: InternalEvent, ...args: any[]): void {
    this.internalListeners
      .filter((listener) => listener.event === event)
      .forEach((listener) => listener.listener(...args))
  }

  protected registerListener(type: string, listener: EventListener): VoidFunction {
    document.addEventListener(type, listener)

    const remove = () => {
      document.removeEventListener(type, listener)
      this.teardowns.delete(remove)
    }

    this.teardowns.add(remove)

    return remove
  }

  // bfcache restores pages without firing `popstate`, so we use `pageshow` to
  // re-validate encrypted history entries after `clearHistory` removed the keys.
  // https://web.dev/articles/bfcache
  protected handlePageshowEvent(event: PageTransitionEvent): void {
    if (event.persisted) {
      history.decrypt().catch(() => this.onMissingHistoryItem())
    }
  }

  protected handlePopstateEvent(event: PopStateEvent): void {
    const state = event.state || null

    if (state === null) {
      const url = hrefToUrl(currentPage.get().url)
      url.hash = environment.location().hash

      history.replaceState({ ...currentPage.getWithoutFlashData(), url: url.href })
      Scroll.reset()

      return
    }

    if (!history.isValidState(state)) {
      return this.onMissingHistoryItem()
    }

    history
      .decrypt(state.page)
      .then((data) => {
        if (currentPage.get().version !== data.version) {
          this.onMissingHistoryItem()
          return
        }

        // Cancel ongoing requests except prefetch requests
        router.cancelAll({ prefetch: false })

        currentPage.setQuietly(data, { preserveState: false }).then(() => {
          Scroll.restore(history.getScrollRegions())
          fireNavigateEvent(currentPage.get(), { type: 'history' })

          const pendingDeferred: Record<string, string[]> = {}
          const pageProps = currentPage.get().props

          for (const [group, props] of Object.entries(data.initialDeferredProps ?? data.deferredProps ?? {})) {
            const missing = props.filter((prop) => get(pageProps, prop) === undefined)

            if (missing.length > 0) {
              pendingDeferred[group] = missing
            }
          }

          if (Object.keys(pendingDeferred).length > 0) {
            this.fireInternalEvent('loadDeferredProps', pendingDeferred)
          }
        })
      })
      .catch(() => {
        this.onMissingHistoryItem()
      })
  }
}

export const eventHandler = new EventHandler()
