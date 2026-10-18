import { ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { createRoot, Root } from 'react-dom/client'

const roots = new Set<Root>()

export const render = (node: ReactNode) => {
  const container = document.createElement('div')
  document.body.append(container)

  const root = createRoot(container)
  roots.add(root)
  flushSync(() => root.render(node))

  return {
    container,
    rerender: (next: ReactNode) => flushSync(() => root.render(next)),
    unmount: () => {
      roots.delete(root)
      flushSync(() => root.unmount())
      container.remove()
    },
  }
}

export const cleanup = () => {
  roots.forEach((root) => flushSync(() => root.unmount()))
  roots.clear()
  document.body.innerHTML = ''
}
