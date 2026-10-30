import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import type { Role } from './authService'
import { useAuth } from './useAuth'

/** Renders children only for the given role; everyone else goes home. Use inside RequireAuth. */
export function RequireRole({ role, children }: { role: Role, children: ReactNode }) {
  const { user } = useAuth()
  if (user?.role !== role) return <Navigate to="/" replace />
  return children
}
