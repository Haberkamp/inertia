import { Deferred, Link, useForm, usePage } from '@inertiajs/react'
import { createFakeServer, defer, errors, InertiaTestApp, redirect } from '@inertiajs/react/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from './render'

afterEach(() => cleanup())

const text = (container: HTMLElement) => container.textContent

const type = async (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await vi.waitFor(() => expect(input.value).toBe(value))
}

function UsersIndex({ users }: { users: { id: number; name: string }[] }) {
  return (
    <ul>
      {users.map((user) => (
        <li key={user.id}>
          <Link href={`/users/${user.id}`}>{user.name}</Link>
        </li>
      ))}
    </ul>
  )
}

function UserShow({ user }: { user: { name: string } }) {
  return <h1>Showing {user.name}</h1>
}

function CreateUser() {
  const form = useForm({ name: '' })
  const { flash } = usePage()

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        form.post('/users')
      }}
    >
      <input aria-label="name" value={form.data.name} onChange={(event) => form.setData('name', event.target.value)} />
      <button type="submit">save</button>
      <span>{form.errors.name}</span>
      <span>{flash.message as string}</span>
    </form>
  )
}

function Dashboard() {
  return (
    <Deferred data="stats" fallback={<p>loading</p>}>
      <Stats />
    </Deferred>
  )
}

function Stats() {
  const { stats } = usePage<{ stats: { visits: number } }>().props

  return <p>{stats.visits} visits</p>
}

function ValidatedName() {
  const form = useForm('post', '/users', { name: '' })

  return (
    <div>
      <input aria-label="name" value={form.data.name} onChange={(event) => form.setData('name', event.target.value)} />
      <button onClick={() => form.validate('name')}>validate</button>
      <span>{form.invalid('name') ? form.errors.name : 'valid'}</span>
    </div>
  )
}

function Home() {
  return <Link href="/dashboard">dashboard</Link>
}

const users = [
  { id: 1, name: 'Taylor' },
  { id: 2, name: 'Jess' },
]

const server = () =>
  createFakeServer({
    'GET /users': { component: 'Users/Index', props: { users } },
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

const pages = { Home, 'Users/Index': UsersIndex, 'Users/Show': UserShow, 'Users/Create': CreateUser, Dashboard }
const resolve = (name: string) => pages[name as keyof typeof pages]

describe('InertiaTestApp with a fake server', () => {
  it('follows links', async () => {
    const fake = server()
    const { container } = render(
      <InertiaTestApp
        page={{ component: 'Users/Index', url: '/users', props: { users } }}
        resolve={resolve}
        server={fake}
      />,
    )

    await vi.waitFor(() => expect(text(container)).toBe('TaylorJess'))
    container.querySelector<HTMLAnchorElement>('a[href="/users/2"]')!.click()

    await vi.waitFor(() => expect(text(container)).toBe('Showing Jess'))
    expect(fake.requests.map((request) => `${request.method} ${request.path}`)).toEqual(['get /users/2'])
  })

  it('shows validation errors and flash messages from form submissions', async () => {
    const { container } = render(
      <InertiaTestApp page={{ component: 'Users/Create', url: '/users/create' }} resolve={resolve} server={server()} />,
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
    const { container } = render(
      <InertiaTestApp page={{ component: 'Home', url: '/' }} component={Home} resolve={resolve} server={server()} />,
    )

    container.querySelector('a')!.click()

    await vi.waitFor(() => expect(text(container)).toBe('42 visits'))
  })

  it('validates with Precognition', async () => {
    const { container } = render(
      <InertiaTestApp server={server()}>
        <ValidatedName />
      </InertiaTestApp>,
    )

    await type(container.querySelector('input')!, 'Ta')
    container.querySelector('button')!.click()

    await vi.waitFor(() => expect(text(container)).toContain('Too short.'))
  })
})
