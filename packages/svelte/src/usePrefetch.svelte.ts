import { currentLocation, router, type VisitOptions } from '@inertiajs/core'
import { onDestroy, onMount } from 'svelte'

export default function usePrefetch(options: VisitOptions = {}) {
  let isPrefetched = $state(false)
  let isPrefetching = $state(false)
  let lastUpdatedAt = $state<number | null>(null)

  const cached = typeof window === 'undefined' ? null : router.getCached(currentLocation().pathname, options)
  const inFlight = typeof window === 'undefined' ? null : router.getPrefetching(currentLocation().pathname, options)

  isPrefetched = cached !== null
  isPrefetching = inFlight !== null
  lastUpdatedAt = cached?.staleTimestamp || null

  let removePrefetchedListener: () => void
  let removePrefetchingListener: () => void

  onMount(() => {
    removePrefetchingListener = router.on('prefetching', ({ detail }) => {
      if (detail.visit.url.pathname === currentLocation().pathname) {
        isPrefetching = true
      }
    })

    removePrefetchedListener = router.on('prefetched', ({ detail }) => {
      if (detail.visit.url.pathname === currentLocation().pathname) {
        isPrefetched = true
        isPrefetching = false
      }
    })
  })

  onDestroy(() => {
    if (removePrefetchedListener) {
      removePrefetchedListener()
    }

    if (removePrefetchingListener) {
      removePrefetchingListener()
    }
  })

  return {
    get isPrefetched() {
      return isPrefetched
    },
    get isPrefetching() {
      return isPrefetching
    },
    get lastUpdatedAt() {
      return lastUpdatedAt
    },
    flush() {
      router.flush(currentLocation().pathname, options)
    },
  }
}
