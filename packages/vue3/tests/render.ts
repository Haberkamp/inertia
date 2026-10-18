import { App, createApp, h, type VNode } from 'vue'

const apps = new Set<App>()

export const render = (node: () => VNode) => {
  const container = document.createElement('div')
  document.body.append(container)

  const app = createApp({ render: node })
  app.config.warnHandler = () => {}
  apps.add(app)
  app.mount(container)

  return {
    container,
    app,
    unmount: () => {
      apps.delete(app)
      app.unmount()
      container.remove()
    },
  }
}

export const cleanup = () => {
  apps.forEach((app) => app.unmount())
  apps.clear()
  document.body.innerHTML = ''
}

export { h }
