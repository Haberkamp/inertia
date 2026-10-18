import { router, usePage, useRemember } from '@inertiajs/react'
import { InertiaTestApp, withInertia } from '@inertiajs/react/testing'
import { Component, ReactNode, StrictMode, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from './render'

afterEach(() => cleanup())

const text = (container: HTMLElement) => container.textContent

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    return this.state.error ? this.state.error.message : this.props.children
  }
}

function UsersIndex({ users }: { users: string[] }) {
  return (
    <ul>
      {users.map((user) => (
        <li key={user}>{user}</li>
      ))}
    </ul>
  )
}

function UserShow({ user }: { user: string }) {
  return <h1>Showing {user}</h1>
}

function CurrentUser() {
  const page = usePage<{ auth: { user: string } }>()

  return (
    <p>
      {page.props.auth.user} on {page.url}
    </p>
  )
}

function Draft() {
  const [draft, setDraft] = useRemember('', 'draft')

  return (
    <div>
      <span>draft: {draft}</span>
      <button onClick={() => setDraft('written')}>write</button>
    </div>
  )
}

describe('InertiaTestApp', () => {
  it('renders a page component with its props', async () => {
    const { container } = render(
      <InertiaTestApp
        page={{ component: 'Users/Index', props: { users: ['Taylor', 'Jonathan'] } }}
        component={UsersIndex}
      />,
    )

    await vi.waitFor(() => expect(text(container)).toBe('TaylorJonathan'))
  })

  it('renders children with the page available through usePage', async () => {
    const { container } = render(
      <InertiaTestApp page={{ url: '/dashboard', props: { auth: { user: 'Taylor' } } }}>
        <CurrentUser />
      </InertiaTestApp>,
    )

    await vi.waitFor(() => expect(text(container)).toBe('Taylor on /dashboard'))
  })

  it('navigates between pages resolved by name', async () => {
    const pages = { 'Users/Index': UsersIndex, 'Users/Show': UserShow }

    const { container } = render(
      <InertiaTestApp
        page={{ component: 'Users/Index', url: '/users', props: { users: ['Taylor'] } }}
        resolve={(name) => pages[name as keyof typeof pages]}
      />,
    )

    await vi.waitFor(() => expect(text(container)).toBe('Taylor'))

    router.push({ component: 'Users/Show', url: '/users/1', props: { user: 'Taylor' } })

    await vi.waitFor(() => expect(text(container)).toBe('Showing Taylor'))
  })

  it('updates children when the page changes', async () => {
    const { container } = render(
      <InertiaTestApp page={{ url: '/dashboard', props: { auth: { user: 'Taylor' } } }}>
        <CurrentUser />
      </InertiaTestApp>,
    )

    router.replaceProp('auth.user', 'Jess')

    await vi.waitFor(() => expect(text(container)).toBe('Jess on /dashboard'))
  })

  it('works in strict mode', async () => {
    const { container } = render(
      <StrictMode>
        <InertiaTestApp page={{ url: '/dashboard', props: { auth: { user: 'Taylor' } } }}>
          <CurrentUser />
        </InertiaTestApp>
      </StrictMode>,
    )

    await vi.waitFor(() => expect(text(container)).toBe('Taylor on /dashboard'))

    router.replaceProp('auth.user', 'Jess')

    await vi.waitFor(() => expect(text(container)).toBe('Jess on /dashboard'))
  })

  it('refuses to render two apps at the same time', async () => {
    render(
      <InertiaTestApp>
        <p>first</p>
      </InertiaTestApp>,
    )

    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { container } = render(
      <ErrorBoundary>
        <InertiaTestApp>
          <p>second</p>
        </InertiaTestApp>
      </ErrorBoundary>,
    )

    await vi.waitFor(() => expect(text(container)).toMatch(/already active/))
  })

  it('can render a new app right after unmounting the previous one', async () => {
    const first = render(
      <InertiaTestApp page={{ url: '/one', props: { auth: { user: 'One' } } }}>
        <CurrentUser />
      </InertiaTestApp>,
    )
    first.unmount()

    const { container } = render(
      <InertiaTestApp page={{ url: '/two', props: { auth: { user: 'Two' } } }}>
        <CurrentUser />
      </InertiaTestApp>,
    )

    await vi.waitFor(() => expect(text(container)).toBe('Two on /two'))
  })

  it('renders a story with the Storybook decorator', async () => {
    const decorator = withInertia({ page: { url: '/dashboard', props: { auth: { user: 'Default' } } } })

    const { container } = render(
      decorator(() => <CurrentUser />, { parameters: { inertia: { page: { props: { auth: { user: 'Story' } } } } } }),
    )

    await vi.waitFor(() => expect(text(container)).toBe('Story on /dashboard'))
  })
})

// These tests run in order and each one checks it can't see what the previous one did
describe('isolation between tests', () => {
  const navigated = vi.fn()

  it('first test navigates, remembers state and listens to events', async () => {
    const { container } = render(
      <InertiaTestApp page={{ url: '/users', props: { auth: { user: 'Taylor' } } }}>
        <CurrentUser />
        <Draft />
      </InertiaTestApp>,
    )

    router.on('navigate', navigated)
    container.querySelector('button')!.click()
    await vi.waitFor(() => expect(text(container)).toContain('draft: written'))

    router.push({ url: '/users/1', props: { auth: { user: 'Jonathan' } } })
    await vi.waitFor(() => expect(text(container)).toContain('Jonathan on /users/1'))
  })

  it('second test starts from a clean slate', async () => {
    navigated.mockClear()

    const { container } = render(
      <InertiaTestApp page={{ url: '/users', props: { auth: { user: 'Taylor' } } }}>
        <CurrentUser />
        <Draft />
      </InertiaTestApp>,
    )

    await vi.waitFor(() => expect(text(container)).toBe('Taylor on /usersdraft: write'))

    router.push({ url: '/users/2', props: { auth: { user: 'Jess' } } })
    await vi.waitFor(() => expect(text(container)).toContain('Jess on /users/2'))

    expect(navigated).not.toHaveBeenCalled()
    expect(window.location.pathname).not.toContain('/users')
  })
})

function Counter() {
  const [count, setCount] = useState(0)

  return <button onClick={() => setCount(count + 1)}>{count}</button>
}

describe('local component state', () => {
  it('keeps component state when props are replaced', async () => {
    const { container } = render(
      <InertiaTestApp page={{ props: { auth: { user: 'Taylor' } } }}>
        <Counter />
        <CurrentUser />
      </InertiaTestApp>,
    )

    container.querySelector('button')!.click()
    await vi.waitFor(() => expect(container.querySelector('button')!.textContent).toBe('1'))

    router.replaceProp('auth.user', 'Jess')
    await vi.waitFor(() => expect(text(container)).toContain('Jess'))

    expect(container.querySelector('button')!.textContent).toBe('1')
  })
})
