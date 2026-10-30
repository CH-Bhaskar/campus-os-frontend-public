import { render, type RenderOptions } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { Providers } from '@/app/Providers'
import { buildRoutes } from '@/app/routes'
import type { User } from '@/core/auth'
import type { TrackManifest } from '@/core/tracks'
import type { ThemeMode } from '@/theme'

export const testUser: User = { id: 'test@example.com', name: 'Test User', email: 'test@example.com', role: 'student' }

interface ProviderOptions {
  /** `true` signs in as `testUser`; pass a User to customize; default is signed out. */
  user?: User | boolean
  theme?: ThemeMode
}

function resolveUser(user: ProviderOptions['user']) {
  if (user === true) return testUser
  if (!user) return null
  return user
}

/** Render a single component with theme + auth providers (no routing). */
export function renderWithProviders(ui: ReactElement, { user, theme = 'light', ...options }: ProviderOptions & RenderOptions = {}) {
  return {
    user: userEvent.setup(),
    ...render(
      <Providers initialUser={resolveUser(user)} initialTheme={theme}>
        {ui}
      </Providers>,
      options,
    ),
  }
}

interface RouteOptions extends ProviderOptions {
  /** Initial URL, e.g. '/login?next=/tracks/example'. */
  route?: string
  /** Defaults to the real app routes. Pass `[track]` to render one track in isolation. */
  tracks?: TrackManifest[]
  routes?: RouteObject[]
}

/** Render the real app route table at `route`. Returns the router so tests can assert on location. */
export function renderRoute({ route = '/', user, theme = 'light', tracks, routes }: RouteOptions = {}) {
  const router = createMemoryRouter(routes ?? buildRoutes(tracks), { initialEntries: [route] })
  const result = render(
    <Providers initialUser={resolveUser(user)} initialTheme={theme}>
      <RouterProvider router={router} />
    </Providers>,
  )
  return { user: userEvent.setup(), router, ...result }
}

export * from '@testing-library/react'
