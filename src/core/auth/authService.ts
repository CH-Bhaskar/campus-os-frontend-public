// Auth against campus-os-backend. The UI talks only to this module.
// Everyone signs in with their email and the OTP the admin was given when creating them.

import { ApiError, apiRequest } from '@/core/api'
import { loadSession, saveSession, type Role, type User } from './session'

export type { Role, User } from './session'

interface TokenResponse {
  access_token: string
  token_type: 'bearer'
  /** Seconds */
  expires_in: number
  profile: { role: Role, name: string, email_id: string }
}

export function getCurrentUser(): User | null {
  return loadSession()?.user ?? null
}

/**
 * Students, faculty and office staff log in at /auth/login; the admin has its own endpoint.
 * The backend answers USE_ADMIN_LOGIN when an admin email hits the user endpoint, so we retry there.
 */
async function login(email_id: string, otp: string): Promise<TokenResponse> {
  const json = { email_id, otp }
  try {
    return await apiRequest<TokenResponse>('/auth/login', { method: 'POST', json })
  } catch (error) {
    if (error instanceof ApiError && error.code === 'USE_ADMIN_LOGIN') {
      return apiRequest<TokenResponse>('/auth/admin/login', { method: 'POST', json })
    }
    throw error
  }
}

export async function signIn(email: string, otp: string): Promise<User> {
  const res = await login(email.trim().toLowerCase(), otp.trim())
  const { profile } = res
  const user: User = { id: profile.email_id, name: profile.name, email: profile.email_id, role: profile.role }
  saveSession({ accessToken: res.access_token, expiresAt: Date.now() + res.expires_in * 1000, user })
  return user
}

/** The backend has no logout endpoint; dropping the token is enough. */
export async function signOut(): Promise<void> {
  saveSession(null)
}
