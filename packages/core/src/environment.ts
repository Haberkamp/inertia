// Everything Inertia reads from or writes to the browser's navigation and session
// state goes through this module. By default it forwards to `window.history`,
// `window.location` and `window.sessionStorage`, so apps behave exactly as before.
// Test scopes swap in in-memory implementations so stories and tests never touch
// the real browser state, and never see each other's.

export interface HistoryEnvironment {
  readonly state: any
  readonly location: Location | URL
  readonly navigationType: NavigationTimingType | null
  pushState(data: unknown, url: string): void
  replaceState(data: unknown, url?: string): void
  /** Perform a full page visit. */
  assign(url: string): void
  /** Perform a full page reload. */
  reload(): void
}

const browserHistory: HistoryEnvironment = {
  get state() {
    return window.history.state
  },
  get location() {
    return window.location
  },
  navigationType: null,
  pushState: (data, url) => window.history.pushState(data, '', url),
  replaceState: (data, url) => window.history.replaceState(data, '', url),
  assign: (url) => {
    window.location.href = url
  },
  reload: () => window.location.reload(),
}

let historyEnvironment: HistoryEnvironment = browserHistory
let storageEnvironment: Storage | null = null
let generation = 0

export const environment = {
  history(): HistoryEnvironment {
    return historyEnvironment
  },

  location(): Location | URL {
    return historyEnvironment.location
  },

  sessionStorage(): Storage {
    return storageEnvironment ?? window.sessionStorage
  },

  isolated(): boolean {
    return historyEnvironment !== browserHistory
  },

  /**
   * Changes whenever a test scope starts or ends, so async work can tell
   * that the scope it was started in is gone.
   */
  generation(): number {
    return generation
  },

  use({ history, sessionStorage }: { history: HistoryEnvironment; sessionStorage: Storage }): void {
    historyEnvironment = history
    storageEnvironment = sessionStorage
    generation++
  },

  restore(): void {
    historyEnvironment = browserHistory
    storageEnvironment = null
    generation++
  },
}

export class MemoryStorage implements Storage {
  protected items = new Map<string, string>()

  public get length(): number {
    return this.items.size
  }

  public clear(): void {
    this.items.clear()
  }

  public getItem(key: string): string | null {
    return this.items.get(key) ?? null
  }

  public key(index: number): string | null {
    return Array.from(this.items.keys())[index] ?? null
  }

  public removeItem(key: string): void {
    this.items.delete(key)
  }

  public setItem(key: string, value: string): void {
    this.items.set(key, String(value))
  }
}

type MemoryHistoryEntry = { url: URL; state: unknown }

export class MemoryHistory implements HistoryEnvironment {
  protected entries: MemoryHistoryEntry[]
  protected index = 0
  protected popstateListener: ((state: unknown) => void) | null = null
  protected pendingTraversals = new Set<ReturnType<typeof setTimeout>>()
  public readonly navigationType = 'navigate' as const
  /** Full page visits (`X-Inertia-Location` responses, reloads) that were requested. */
  public readonly fullPageVisits: string[] = []

  constructor(url: string = '/') {
    this.entries = [{ url: new URL(url, window.location.origin), state: null }]
  }

  public get state(): any {
    return this.entries[this.index].state
  }

  public get location(): URL {
    return this.entries[this.index].url
  }

  public get url(): string {
    return this.location.href
  }

  public get length(): number {
    return this.entries.length
  }

  public onPopstate(listener: ((state: unknown) => void) | null): void {
    this.popstateListener = listener
  }

  public pushState(data: unknown, url: string): void {
    this.entries = this.entries.slice(0, this.index + 1)
    this.entries.push({ url: this.resolve(url), state: this.clone(data) })
    this.index = this.entries.length - 1
  }

  public replaceState(data: unknown, url?: string): void {
    this.entries[this.index] = {
      url: url === undefined ? this.location : this.resolve(url),
      state: this.clone(data),
    }
  }

  public assign(url: string): void {
    this.fullPageVisits.push(this.resolve(url).href)
  }

  public reload(): void {
    this.fullPageVisits.push(this.url)
  }

  public back(): void {
    this.go(-1)
  }

  public forward(): void {
    this.go(1)
  }

  /** Like `window.history.go()`, the traversal and its popstate happen asynchronously. */
  public go(delta: number): void {
    const timer = setTimeout(() => {
      this.pendingTraversals.delete(timer)

      const index = this.index + delta

      if (delta === 0 || index < 0 || index >= this.entries.length) {
        return
      }

      this.index = index
      this.popstateListener?.(this.clone(this.state))
    })

    this.pendingTraversals.add(timer)
  }

  public dispose(): void {
    this.pendingTraversals.forEach((timer) => clearTimeout(timer))
    this.pendingTraversals.clear()
    this.popstateListener = null
  }

  protected resolve(url: string): URL {
    return new URL(url, this.location)
  }

  // The browser structured-clones history state, so mutating it afterwards has no effect
  protected clone<T>(data: T): T {
    return data === undefined ? (null as T) : structuredClone(data)
  }
}
