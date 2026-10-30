// The signed-in session (JWT + who it belongs to). Kept in sessionStorage so it ends with the tab.

export type Role = 'admin' | 'student' | 'faculty' | 'office_staff'

export interface User {
  /** The user's email_id; the backend uses it as the user's key. */
  id: string
  name: string
  email: string
  role: Role
}

export interface Session {
  accessToken: string
  /** Epoch ms after which the token is no longer accepted. */
  expiresAt: number
  user: User
}

const SESSION_KEY = 'campus-os:session'

export function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as Session
    return session.expiresAt > Date.now() ? session : null
  } catch {
    return null
  }
}

export function saveSession(session: Session | null) {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // Storage unavailable: the session lives in memory only.
  }
}
