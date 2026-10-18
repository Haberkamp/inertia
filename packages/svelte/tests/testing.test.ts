import { router } from '@inertiajs/svelte'
import { createFakeServer, defer, errors, InertiaTestApp, redirect, withInertia } from '@inertiajs/svelte/testing'
import { createRawSnippet, flushSync, mount, unmount, type Component } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Children from './fixtures/Children.svelte'
import CreateUser from './fixtures/CreateUser.svelte'
import Dashboard from './fixtures/Dashboard.svelte'
import Home from './fixtures/Home.svelte'
import UserShow from './fixtures/UserShow.svelte'
import UsersIndex from './fixtures/UsersIndex.svelte'

const mounted = new Set<Record<string, any>>()

const render = <Props extends Record<string, any>>(component: Component<Props>, props: Props) => {
  const container = document.createElement('div')
  document.body.append(container)

  const instance = mount(component, { target: container, props })
  flushSync()
  mounted.add(instance)

  return {
    container,
    unmount: () => {
      mounted.delete(instance)
      unmount(instance)
      container.remove()
    },
  }
}

afterEach(() => {
  mounted.forEach((instance) => unmount(instance))
  mounted.clear()
  document.body.innerHTML = ''
})

const text = (container: HTMLElement) => container.textContent?.replace(/\s+/g, ' ').trim()

const type = async (input: HTMLInputElement, value: string) => {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await vi.waitFor(() => expect(input.value).toBe(value))
}

const users = [
  { id: 1, name: 'Taylor' },
  { id: 2, name: 'Jess' },
]

const server = () =>
  createFakeServer({
    'GET /users/:id': ({ params }) => ({
      component: 'Users/Show',
      props: { user: users.find((user) => user.id === Number(params.id)) },
    }),
    'GET /users/create': { component: 'Users/Create' },
    'POST /users': ({ data }) =>
      data.name?.length >= 3
        ? redirect('/users/create', { flash: { message: 'Saved!' } })
        : errors({ name: data.name ? 'Too short.' : 'Required.' }),
    'GET /dashboard': { component: 'Dashboard', props: { stats: defer(() => ({ visits: 42 })) } },
  })

const pages = { Home, Dashboard, 'Users/Index': UsersIndex, 'Users/Show': UserShow, 'Users/Create': CreateUser }
const resolve = (name: string) => ({ default: pages[name as keyof typeof pages] as Component })

describe('InertiaTestApp', () => {
  it('renders a page component with its props', async () => {
    const { container } = render(InertiaTestApp, {
      page: { component: 'Users/Index', props: { users } },
      component: { default: UsersIndex as Component },
    })

    await vi.waitFor(() => expect(text(container)).toBe('TaylorJess'))
  })

  it('renders children with the current page', async () => {
    const { container } = render(Children, {
      show: ['user'],
      page: { url: '/dashboard', props: { auth: { user: 'Taylor' } } },
    })

    await vi.waitFor(() => expect(text(container)).toBe('Taylor on /dashboard'))

    router.replaceProp('auth.user', 'Jess')

    await vi.waitFor(() => expect(text(container)).toBe('Jess on /dashboard'))
  })

  it('refuses to render two apps at the same time', () => {
    const children = createRawSnippet(() => ({ render: () => '<p>app</p>' }))
    render(InertiaTestApp, { children })

    expect(() => render(InertiaTestApp, { children })).toThrow(/already active/)
  })

  it('can render a new app right after unmounting the previous one', async () => {
    const first = render(Children, { show: ['user'], page: { url: '/one', props: { auth: { user: 'One' } } } })
    first.unmount()

    const { container } = render(Children, { show: ['user'], page: { url: '/two', props: { auth: { user: 'Two' } } } })

    await vi.waitFor(() => expect(text(container)).toBe('Two on /two'))
  })

  it('renders stories with the Storybook decorator', async () => {
    const decorator = withInertia({ page: { url: '/dashboard', props: { auth: { user: 'Default' } } } })
    const { Component, props } = decorator(null, {
      parameters: { inertia: { page: { props: { auth: { user: 'Story' } } } } },
    })

    const { container } = render(Children, { ...props, show: ['user'] })

    expect(Component).toBe(InertiaTestApp)
    await vi.waitFor(() => expect(text(container)).toBe('Story on /dashboard'))
  })
})

describe('isolation between tests', () => {
  const navigated = vi.fn()

  it('first test navigates, remembers state and listens to events', async () => {
    const { container } = render(Children, {
      show: ['user', 'draft'],
      page: { url: '/users', props: { auth: { user: 'Taylor' } } },
    })

    router.on('navigate', navigated)
    container.querySelector('button')!.click()
    await vi.waitFor(() => expect(text(container)).toContain('draft: written'))

    router.push({ url: '/users/1', props: { auth: { user: 'Jonathan' } } })
    await vi.waitFor(() => expect(text(container)).toContain('Jonathan on /users/1'))
  })

  it('second test starts from a clean slate', async () => {
    navigated.mockClear()

    const { container } = render(Children, {
      show: ['user', 'draft'],
      page: { url: '/users', props: { auth: { user: 'Taylor' } } },
    })

    await vi.waitFor(() => expect(text(container)).toBe('Taylor on /users draft: write'))

    router.push({ url: '/users/2', props: { auth: { user: 'Jess' } } })
    await vi.waitFor(() => expect(text(container)).toContain('Jess on /users/2'))

    expect(navigated).not.toHaveBeenCalled()
    expect(window.location.pathname).not.toContain('/users')
  })
})

describe('InertiaTestApp with a fake server', () => {
  it('follows links', async () => {
    const fake = server()
    const { container } = render(InertiaTestApp, {
      page: { component: 'Users/Index', url: '/users', props: { users } },
      resolve,
      server: fake,
    })

    await vi.waitFor(() => expect(text(container)).toBe('TaylorJess'))
    container.querySelector<HTMLAnchorElement>('a[href$="/users/2"]')!.click()

    await vi.waitFor(() => expect(text(container)).toBe('Showing Jess'))
    expect(fake.requests.map((request) => `${request.method} ${request.path}`)).toEqual(['get /users/2'])
  })

  it('shows validation errors and flash messages from form submissions', async () => {
    const { container } = render(InertiaTestApp, {
      page: { component: 'Users/Create', url: '/users/create' },
      resolve,
      server: server(),
    })

    await vi.waitFor(() => expect(container.querySelector('button')).not.toBeNull())
    container.querySelector('button')!.click()
    await vi.waitFor(() => expect(text(container)).toContain('Required.'))

    await type(container.querySelector('input')!, 'Taylor')
    container.querySelector('button')!.click()

    await vi.waitFor(() => expect(text(container)).toContain('Saved!'))
    expect(text(container)).not.toContain('Required.')
  })

  it('loads deferred props', async () => {
    const { container } = render(InertiaTestApp, { page: { component: 'Home', url: '/' }, resolve, server: server() })

    await vi.waitFor(() => expect(container.querySelector('a')).not.toBeNull())
    container.querySelector('a')!.click()

    await vi.waitFor(() => expect(text(container)).toBe('42 visits'))
  })

  it('validates with Precognition', async () => {
    const { container } = render(Children, { show: ['validated'], server: server() })

    await type(container.querySelector('input')!, 'Ta')
    container.querySelector('button')!.click()

    await vi.waitFor(() => expect(text(container)).toContain('Too short.'))
  })
})
