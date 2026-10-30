/** A failed API call. Mirrors the backend error envelope: {"error": {"code", "message", "details"}, "request_id"}. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

interface FieldIssue {
  field?: string | null
  message?: string
}

/** Per-field messages from a 422 VALIDATION_ERROR, keyed by field name (e.g. "email_id"). */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {}
  const out: Record<string, string> = {}
  const details = error.details
  if (Array.isArray(details)) {
    for (const issue of details as FieldIssue[]) {
      if (issue.field && issue.message && !out[issue.field]) out[issue.field] = issue.message
    }
  } else if (details && typeof details === 'object' && 'field' in details) {
    const field = (details as FieldIssue).field
    if (field) out[field] = error.message
  }
  return out
}
