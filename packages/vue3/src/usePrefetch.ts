import { currentLocation, router, VisitOptions } from '@inertiajs/core'
import { onMounted, onUnmounted, ref, Ref } from 'vue'

export default function usePrefetch(options: VisitOptions = {}): {
  lastUpdatedAt: Ref<number | null>
  isPrefetching: Ref<boolean>
  isPrefetched: Ref<boolean>
  flush: () => void
} {
  const isPrefetching = ref(false)
  const lastUpdatedAt = ref<number | null>(null)
  const isPrefetched = ref(false)

  const cached = typeof window === 'undefined' ? null : router.getCached(currentLocation().pathname, options)
  const inFlight = typeof window === 'undefined' ? null : router.getPrefetching(currentLocation().pathname, options)

  lastUpdatedAt.value = cached?.staleTimestamp || null

  isPrefetching.value = inFlight !== null
  isPrefetched.value = cached !== null

  let onPrefetchedListener: () => void
  let onPrefetchingListener: () => void

  onMounted(() => {
    onPrefetchingListener = router.on('prefetching', (e) => {
      if (e.detail.visit.url.pathname === currentLocation().pathname) {
        isPrefetching.value = true
      }
    })

    onPrefetchedListener = router.on('prefetched', (e) => {
      if (e.detail.visit.url.pathname === currentLocation().pathname) {
        isPrefetching.value = false
        isPrefetched.value = true
      }
    })
  })

  onUnmounted(() => {
    onPrefetchedListener()
    onPrefetchingListener()
  })

  return {
    lastUpdatedAt,
    isPrefetching,
    isPrefetched,
    flush: () => router.flush(currentLocation().pathname, options),
  }
}
