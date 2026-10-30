import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@/core/auth'
import { renderRoute, screen, waitFor } from '@/test/render'

const admin: User = { id: 'admin@team1.com', name: 'Team Admin', email: 'admin@team1.com', role: 'admin' }

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Admin dashboard', () => {
  it('is only reachable by the admin', async () => {
    const { router } = renderRoute({ route: '/admin', user: true })
    await waitFor(() => expect(router.state.location.pathname).toBe('/'))
    expect(screen.queryByTestId('nav-admin')).not.toBeInTheDocument()
  })

  it('shows only the fields of the chosen role', async () => {
    const { user } = renderRoute({ route: '/admin', user: admin })
    expect(screen.getByLabelText('USN')).toBeInTheDocument()
    expect(screen.queryByLabelText('Designation')).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Role'), 'faculty')
    expect(screen.queryByLabelText('USN')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Department')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Designation')).toBeInTheDocument()
  })

  it('validates before calling the API', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { user } = renderRoute({ route: '/admin', user: admin })
    await user.type(screen.getByLabelText('Phone number'), '123')
    await user.click(screen.getByRole('button', { name: 'Create user' }))
    expect(screen.getByLabelText('Full name')).toHaveAccessibleDescription('Name is required.')
    expect(screen.getByLabelText('Phone number')).toHaveAccessibleDescription('Enter 10 to 15 digits, optionally starting with +.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('creates an office staff member and shows their OTP', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, {
      role: 'office_staff', name: 'Ravi Shetty', email_id: 'ravi@team1.com', phone_number: '9876543211',
      dept: 'Student Affairs', designation: 'Clerk', otp: '731905',
    }))
    vi.stubGlobal('fetch', fetchMock)
    const { user } = renderRoute({ route: '/admin', user: admin })
    await user.selectOptions(screen.getByLabelText('Role'), 'office_staff')
    await user.type(screen.getByLabelText('Full name'), 'Ravi Shetty')
    await user.type(screen.getByLabelText('Department'), 'Student Affairs')
    await user.type(screen.getByLabelText('Designation'), 'Clerk')
    await user.type(screen.getByLabelText('Email'), 'ravi@team1.com')
    await user.type(screen.getByLabelText('Phone number'), '9876543211')
    await user.click(screen.getByRole('button', { name: 'Create user' }))

    expect(await screen.findByTestId('create-user-otp')).toHaveTextContent('731905')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/\/api\/v1\/admin\/users$/)
    expect(JSON.parse(init.body)).toEqual({
      role: 'office_staff', name: 'Ravi Shetty', dept: 'Student Affairs', designation: 'Clerk',
      email_id: 'ravi@team1.com', phone_number: '9876543211',
    })
  })

  it('shows backend field errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(422, {
      error: {
        code: 'EMAIL_DOMAIN_MISMATCH',
        message: "email_id must belong to your institution's domain '@team1.com'",
        details: { field: 'email_id', expected_domain: 'team1.com' },
      },
    })))
    const { user } = renderRoute({ route: '/admin', user: admin })
    await user.type(screen.getByLabelText('Full name'), 'Asha Kumar')
    await user.type(screen.getByLabelText('USN'), '1CF24CS001')
    await user.type(screen.getByLabelText('Department'), 'CSE')
    await user.type(screen.getByLabelText('Email'), 'asha@other.com')
    await user.type(screen.getByLabelText('Phone number'), '9876543210')
    await user.click(screen.getByRole('button', { name: 'Create user' }))

    expect(await screen.findByTestId('create-user-error')).toHaveTextContent('@team1.com')
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(/@team1\.com/)
  })
})
