import type { RouteObject } from 'react-router'
import { RequireAuth, RequireRole } from '@/core/auth'
import type { TrackManifest } from '@/core/tracks'
import { tracks as registeredTracks } from '@/core/tracks/registry'
import { Spinner } from '@/ui'
import { CreateUserPage } from '@/features/admin/CreateUserPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { AppLayout } from './AppLayout'
import { AuthLayout } from './AuthLayout'
import { HomePage } from './HomePage'
import { NotFoundPage } from './NotFoundPage'

/** Route table, shared by the browser router and by tests (createMemoryRouter). */
export function buildRoutes(tracks: TrackManifest[] = registeredTracks): RouteObject[] {
  return [
    {
      element: <AuthLayout />,
      children: [
        { path: '/login', element: <LoginPage /> },
      ],
    },
    {
      element: (
        <RequireAuth>
          <AppLayout />
        </RequireAuth>
      ),
      children: [
        { path: '/', element: <HomePage /> },
        {
          path: '/admin',
          element: (
            <RequireRole role="admin">
              <CreateUserPage />
            </RequireRole>
          ),
        },
        ...tracks.map((track) => ({
          path: `/tracks/${track.id}`,
          // Shown while a lazy track route loads on a direct page load.
          hydrateFallbackElement: <Spinner label={`Loading ${track.title}`} />,
          children: track.routes,
        })),
      ],
    },
    { path: '*', element: <NotFoundPage /> },
  ]
}
