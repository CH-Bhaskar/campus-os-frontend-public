/**
 * Track-local fetch wrapper for the CampusOS API (DocDesk track).
 *
 * Same interface as the shared template client, but the bearer <redacted> comes from
 * the starter's session store (@/core/auth/session) and the base URL from
 * @/core/api/config — so the track stays inside the track-boundary rules.
 * On 401 the session is dropped and the user is sent back to /login.
 */
import { API_BASE_URL, REQUEST_TIMEOUT_MS } from '@/core/api/config';
import { loadSession, saveSession } from '@/core/auth/session';
import type { Page } from './types';

export class ApiError extends Error {
  /** Machine-readable code, e.g. "REQUEST_NOT_PENDING" — drive UI logic off this. */
  code: string;
  status: number;
  details: unknown;
  requestId: string | null;

  constructor(
    status: number,
    code: string,
    message: string,
    details: unknown = null,
    requestId: string | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  get isAuthError(): boolean {
    return this.status === 401;
  }
}

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface ApiOptions {
  method?: HttpMethod;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: object | FormData;
  /**
   * Token override. `undefined` (default) = read from the starter session,
   * `null` = send no Authorization header.
   */
  token?: string | null;
}

function buildUrl(path: string, query?: ApiOptions['query']): string {
  const url = new URL(API_BASE_URL + path);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

function buildInit(opts: ApiOptions): RequestInit {
  const { method = 'GET', body, token } = opts;
  const resolvedToken = token === undefined ? loadSession()?.accessToken ?? null : token;
  const headers: Record<string, string> = {};
  if (resolvedToken) headers['Authorization'] = `Bearer ${resolvedToken}`;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body; // browser sets the multipart boundary itself
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  return { method, headers, body: payload, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) };
}

interface ErrorBody {
  error?: { code?: string; message?: string; details?: unknown };
  request_id?: string;
}

function toApiError(status: number, data: unknown): ApiError {
  const body = (data && typeof data === 'object' ? (data as ErrorBody) : {}) as ErrorBody;
  const err = body.error ?? {};
  return new ApiError(
    status,
    err.code ?? `HTTP_${status}`,
    err.message ?? `Request failed with status ${status}`,
    err.details ?? null,
    body.request_id ?? null,
  );
}

async function doFetch(path: string, opts: ApiOptions): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), buildInit(opts));
  } catch (err) {
    if (err instanceof DOMException && err.name === 'TimeoutError') {
      throw new ApiError(0, 'TIMEOUT', 'The server took too long to respond. Try again.');
    }
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.');
  }
  if (!res.ok) {
    const ct = res.headers.get('content-type') ?? '';
    const data = ct.includes('application/json') ? await res.json().catch(() => null) : null;
    if (res.status === 401 && !path.startsWith('/auth/')) {
      saveSession(null);
      window.location.assign('/login');
    }
    throw toApiError(res.status, data);
  }
  return res;
}

/** JSON request. Returns the parsed body (undefined for 204). */
export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const res = await doFetch(path, opts);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Binary request — for the download endpoints (document, filled form). */
export async function apiBlob(path: string, opts: ApiOptions = {}): Promise<Blob> {
  const res = await doFetch(path, opts);
  return res.blob();
}

/**
 * Build a FormData payload. Skips undefined/null; appends Files as-is;
 * arrays repeat the field; booleans → "true"/"false".
 */
export function toFormData(fields: object): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    if (v instanceof File) {
      fd.append(k, v);
      continue;
    }
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item === undefined || item === null) continue;
        if (item instanceof File) fd.append(k, item);
        else fd.append(k, String(item));
      }
      continue;
    }
    if (typeof v === 'boolean') {
      fd.append(k, v ? 'true' : 'false');
      continue;
    }
    fd.append(k, String(v));
  }
  return fd;
}

/**
 * Follow cursor pagination until next_cursor is null (limit=100 pages).
 */
export async function fetchAllPages<T>(
  path: string,
  opts: Omit<ApiOptions, 'query'> & {
    query?: Record<string, string | number | boolean | undefined | null>;
  } = {},
): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | null | undefined;
  let first = true;
  while (first || cursor) {
    first = false;
    const page = await api<Page<T>>(path, {
      ...opts,
      query: { ...opts.query, limit: 100, cursor: cursor ?? undefined },
    });
    items.push(...page.items);
    cursor = page.next_cursor;
  }
  return items;
}
