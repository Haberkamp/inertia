import { Deferred, Link, router, useForm, usePage, useRemember } from '@inertiajs/vue3'
import { createFakeServer, defer, errors, InertiaTestApp, redirect, withInertia } from '@inertiajs/vue3/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { cleanup, render } from './render'

afterEach(() => cleanup())

const text = (container: HTMLElement) => container.textContent

const type = async (input: HTMLInputElement, value: string) => {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await vi.waitFor(() => expect(input.value).toBe(value))
}

const UsersIndex = defineComponent({
  props: { users: { type: Array as () => { id: number; name: string }[], required: true } },
  setup: (props) => () =>
    h(
      'ul',
      props.users.map((user) => h('li', { key: user.id }, [h(Link, { href: `/users/${user.id}` }, () => user.name)])),
    ),
})

const UserShow = defineComponent({
  props: { user: { type: Object as () => { name: string }, required: true } },
  setup: (props) => () => h('h1', `Showing ${props.user.name}`),
})

const CurrentUser = defineComponent({
  setup() {
    const page = usePage<{ auth: { user: string } }>()

    return () => h('p', `${page.props.auth.user} on ${page.url}`)
  },
})

const Draft = defineComponent({
  setup() {
    const draft = useRemember(ref(''), 'draft')

    return () =>
      h('div', [h('span', `draft: ${draft.value}`), h('button', { onClick: () => (draft.value = 'written') }, 'write')])
  },
})

const CreateUser = defineComponent({
  setup() {
    const form = useForm({ name: '' })
    const page = usePage()

    return () =>
      h('form', { onSubmit: (event: Event) => (event.preventDefault(), form.post('/users')) }, [
        h('input', {
          value: form.name,
          onInput: (event: Event) => (form.name = (event.target as HTMLInputElement).value),
        }),
        h('button', { type: 'submit' }, 'save'),
        h('span', form.errors.name),
        h('span', page.flash.message as string),
      ])
  },
})

const Stats = defineComponent({
  setup() {
    const page = usePage<{ stats: { visits: number } }>()

    return () => h('p', `${page.props.stats.visits} visits`)
  },
})

const Dashboard = defineComponent({
  setup: () => () => h(Deferred, { data: 'stats' }, { default: () => h(Stats), fallback: () => h('p', 'loading') }),
})

const Home = defineComponent({ setup: () => () => h(Link, { href: '/dashboard' }, () => 'dashboard') })

const ValidatedName = defineComponent({
  setup() {
    const form = useForm('post', '/users', { name: '' })

    return () =>
      h('div', [
        h('input', {
          value: form.name,
          onInput: (event: Event) => (form.name = (event.target as HTMLInputElement).value),
        }),
        h('button', { onClick: () => form.validate('name') }, 'validate'),
        h('span', form.invalid('name') ? form.errors.name : 'valid'),
      ])
  },
})

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
const resolve = (name: string) => pages[name as keyof typeof pages]

describe('InertiaTestApp', () => {
  it('renders a page component with its props', async () => {
    const { container } = render(() =>
      h(InertiaTestApp, { page: { component: 'Users/Index', props: { users } }, component: UsersIndex }),
    )

    await vi.waitFor(() => expect(text(container)).toBe('TaylorJess'))
  })

  it('renders slot content with the page available through usePage', async () => {
    const { container } = render(() =>
      h(InertiaTestApp, { page: { url: '/dashboard', props: { auth: { user: 'Taylor' } } } }, () => h(CurrentUser)),
    )

    await vi.waitFor(() => expect(text(container)).toBe('Taylor on /dashboard'))

    router.replaceProp('auth.user', 'Jess')

    await vi.waitFor(() => expect(text(container)).toBe('Jess on /dashboard'))
  })

  it('refuses to render two apps at the same time', () => {
    render(() => h(InertiaTestApp, null, () => h('p', 'first')))

    expect(() => render(() => h(InertiaTestApp, null, () => h('p', 'second')))).toThrow(/already active/)
  })

  it('can render a new app right after unmounting the previous one', async () => {
    const first = render(() =>
      h(InertiaTestApp, { page: { url: '/one', props: { auth: { user: 'One' } } } }, () => h(CurrentUser)),
    )
    first.unmount()

    const { container } = render(() =>
      h(InertiaTestApp, { page: { url: '/two', props: { auth: { user: 'Two' } } } }, () => h(CurrentUser)),
    )

    await vi.waitFor(() => expect(text(container)).toBe('Two on /two'))
  })

  it('renders a story with the Storybook decorator', async () => {
    const decorator = withInertia({ page: { url: '/dashboard', props: { auth: { user: 'Default' } } } })
    const Story = decorator(() => CurrentUser, {
      parameters: { inertia: { page: { props: { auth: { user: 'Story' } } } } },
    })

    const { container } = render(() => h(Story))

    await vi.waitFor(() => expect(text(container)).toBe('Story on /dashboard'))
  })
})

describe('isolation between tests', () => {
  const navigated = vi.fn()

  it('first test navigates, remembers state and listens to events', async () => {
    const { container } = render(() =>
      h(InertiaTestApp, { page: { url: '/users', props: { auth: { user: 'Taylor' } } } }, () => [
        h(CurrentUser),
        h(Draft),
      ]),
    )

    router.on('navigate', navigated)
    container.querySelector('button')!.click()
    await vi.waitFor(() => expect(text(container)).toContain('draft: written'))

    router.push({ url: '/users/1', props: { auth: { user: 'Jonathan' } } })
    await vi.waitFor(() => expect(text(container)).toContain('Jonathan on /users/1'))
  })

  it('second test starts from a clean slate', async () => {
    navigated.mockClear()

    const { container } = render(() =>
      h(InertiaTestApp, { page: { url: '/users', props: { auth: { user: 'Taylor' } } } }, () => [
        h(CurrentUser),
        h(Draft),
      ]),
    )

    await vi.waitFor(() => expect(text(container)).toBe('Taylor on /usersdraft: write'))

    router.push({ url: '/users/2', props: { auth: { user: 'Jess' } } })
    await vi.waitFor(() => expect(text(container)).toContain('Jess on /users/2'))

    expect(navigated).not.toHaveBeenCalled()
    expect(window.location.pathname).not.toContain('/users')
  })
})

describe('InertiaTestApp with a fake server', () => {
  it('follows links', async () => {
    const fake = server()
    const { container } = render(() =>
      h(InertiaTestApp, { page: { component: 'Users/Index', url: '/users', props: { users } }, resolve, server: fake }),
    )

    await vi.waitFor(() => expect(text(container)).toBe('TaylorJess'))
    container.querySelector<HTMLAnchorElement>('a[href="/users/2"]')!.click()

    await vi.waitFor(() => expect(text(container)).toBe('Showing Jess'))
    expect(fake.requests.map((request) => `${request.method} ${request.path}`)).toEqual(['get /users/2'])
  })

  it('shows validation errors and flash messages from form submissions', async () => {
    const { container } = render(() =>
      h(InertiaTestApp, { page: { component: 'Users/Create', url: '/users/create' }, resolve, server: server() }),
    )

    await vi.waitFor(() => expect(container.querySelector('button')).not.toBeNull())
    container.querySelector('button')!.click()
    await vi.waitFor(() => expect(text(container)).toContain('Required.'))

    await type(container.querySelector('input')!, 'Taylor')
    container.querySelector('button')!.click()

    await vi.waitFor(() => expect(text(container)).toContain('Saved!'))
    expect(text(container)).not.toContain('Required.')
  })

  it('loads deferred props', async () => {
    const { container } = render(() =>
      h(InertiaTestApp, { page: { component: 'Home', url: '/' }, resolve, server: server() }),
    )

    await vi.waitFor(() => expect(container.querySelector('a')).not.toBeNull())
    container.querySelector('a')!.click()

    await vi.waitFor(() => expect(text(container)).toBe('42 visits'))
  })

  it('validates with Precognition', async () => {
    const { container } = render(() => h(InertiaTestApp, { server: server() }, () => h(ValidatedName)))

    await type(container.querySelector('input')!, 'Ta')
    container.querySelector('button')!.click()

    await vi.waitFor(() => expect(text(container)).toContain('Too short.'))
  })
})
