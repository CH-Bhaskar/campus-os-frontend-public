import { loadSession, saveSession } from '@/core/auth/session'
import { API_BASE_URL, REQUEST_TIMEOUT_MS } from './config'
import { ApiError } from './errors'

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** JSON body */
  json?: unknown
}

/**
 * Calls `${API_BASE_URL}/api/v1${path}` with the session's bearer token and turns the backend's
 * error envelope into an ApiError. Every API call in the app goes through here.
 */
export async function apiRequest<T>(path: string, { method = 'GET', json }: RequestOptions = {}): Promise<T> {
  const headers = new Headers({ Accept: 'application/json' })
  const token = loadSession()?.accessToken
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (json !== undefined) headers.set('Content-Type', 'application/json')

  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}/api/v1${path}`, {
      method,
      headers,
      body: json === undefined ? undefined : JSON.stringify(json),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ApiError(0, 'TIMEOUT', 'The server took too long to respond. Try again.')
    }
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.')
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) {
    const e = data?.error
    // Expired or revoked token on a protected route: drop the session and start over at the login page.
    if (res.status === 401 && !path.startsWith('/auth/')) {
      saveSession(null)
      window.location.assign('/login')
    }
    throw new ApiError(res.status, e?.code ?? 'UNKNOWN', e?.message ?? 'Something went wrong. Try again.', e?.details)
  }
  return data as T
}
