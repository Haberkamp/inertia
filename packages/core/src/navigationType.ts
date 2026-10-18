import { environment } from './environment'

class NavigationType {
  protected type: NavigationTimingType

  public constructor() {
    this.type = this.resolveType()
  }

  protected resolveType(): NavigationTimingType {
    if (typeof window === 'undefined') {
      return 'navigate'
    }

    const entry = window.performance?.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined

    return entry?.type ?? 'navigate'
  }

  public get(): NavigationTimingType {
    return environment.history().navigationType ?? this.type
  }

  public isBackForward(): boolean {
    return this.get() === 'back_forward'
  }

  public isReload(): boolean {
    return this.get() === 'reload'
  }
}

export const navigationType = new NavigationType()
