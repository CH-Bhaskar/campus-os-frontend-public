import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderRoute, screen, waitFor } from '@/test/render'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const token = (role: string, name: string, email_id: string) =>
  jsonResponse(200, { access_token: 'jwt', token_type: 'bearer', expires_in: 3600, profile: { role, name, email_id } })

afterEach(() => {
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

describe('Login', () => {
  it('shows field errors without submitting', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { user } = renderRoute({ route: '/login' })
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Email is required.')
    expect(screen.getByLabelText('OTP')).toHaveAccessibleDescription('OTP is required.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the backend error when the OTP is rejected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      jsonResponse(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email_id or OTP' } }),
    ))
    const { user } = renderRoute({ route: '/login' })
    await user.type(screen.getByLabelText('Email'), 'asha@team1.com')
    await user.type(screen.getByLabelText('OTP'), '000000')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email_id or OTP')
  })

  it('signs in and returns to ?next', async () => {
    const fetchMock = vi.fn().mockResolvedValue(token('student', 'Asha Kumar', 'asha@team1.com'))
    vi.stubGlobal('fetch', fetchMock)
    const { user, router } = renderRoute({ route: '/login?next=%2Ftracks%2Fexample' })
    await user.type(screen.getByLabelText('Email'), 'Asha@team1.com')
    await user.type(screen.getByLabelText('OTP'), '482913')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/tracks/example'))

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/api\/v1\/auth\/login$/)
    expect(JSON.parse(init.body)).toEqual({ email_id: 'asha@team1.com', otp: '482913' })
  })

  it('falls back to the admin endpoint for the admin account', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(400, { error: { code: 'USE_ADMIN_LOGIN', message: 'Use admin login' } }))
      .mockResolvedValueOnce(token('admin', 'Team Admin', 'admin@team1.com'))
    vi.stubGlobal('fetch', fetchMock)
    const { user } = renderRoute({ route: '/login' })
    await user.type(screen.getByLabelText('Email'), 'admin@team1.com')
    await user.type(screen.getByLabelText('OTP'), '123456')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByTestId('nav-admin')).toBeInTheDocument()
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/api\/v1\/auth\/admin\/login$/)
  })
})

describe('RequireAuth', () => {
  it('redirects signed-out users to /login with next', async () => {
    const { router } = renderRoute({ route: '/tracks/example' })
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'))
    expect(router.state.location.search).toBe('?next=%2Ftracks%2Fexample')
  })

  it('redirects signed-in users away from /login', async () => {
    const { router } = renderRoute({ route: '/login', user: true })
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  })
})
