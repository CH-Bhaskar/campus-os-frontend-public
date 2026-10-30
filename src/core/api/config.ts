/** Base URL of campus-os-backend, from VITE_API_BASE_URL in .env. */
export const API_BASE_URL = String(import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000').replace(/\/+$/, '')

/** Requests that take longer than this are aborted and reported as a timeout. */
export const REQUEST_TIMEOUT_MS = 15_000
