
/**
 * Turns an ApiError (or any thrown value) into friendly UI text.
 * Drive logic off error.code — never off the server's message wording.
 */
import { ApiError } from '../api/client';
import { Icon } from './ui';

const FRIENDLY: Record<string, string> = {
  // common
  INVALID_CREDENTIALS: 'Wrong email or OTP. Please try again.',
  TOKEN_EXPIRED: 'Your session expired. Please log in again.',
  UNAUTHORIZED: 'Please log in to continue.',
  INVALID_TOKEN: 'Your session is invalid. Please log in again.',
  USE_ADMIN_LOGIN: 'This is an admin account — use the Admin tab to log in.',
  UNKNOWN_INSTITUTION: 'This email domain is not registered with CampusOS.',
  RATE_LIMITED: 'Too many attempts. Please wait a moment and retry.',
  FORBIDDEN: 'Your role is not allowed to do this.',
  NOT_FOUND: 'Not found — it may have been deleted.',
  ALREADY_EXISTS: 'This already exists.',
  VALIDATION_ERROR: 'Some fields need fixing — see the details below.',
  EMAIL_DOMAIN_MISMATCH: 'The email must use your team domain.',
  FIELD_NOT_ALLOWED_FOR_ROLE: 'That field does not apply to this role.',
  PAYLOAD_TOO_LARGE: 'The upload is too big.',
  FILE_TOO_LARGE: 'The file is too big.',
  IMAGE_TOO_LARGE: 'The image is too big.',
  UNSUPPORTED_FILE_TYPE: 'This file type is not allowed.',
  UNSUPPORTED_IMAGE_TYPE: 'This image type is not allowed.',
  STORAGE_NOT_CONFIGURED: 'File uploads are not set up on the server — tell the organisers.',
  // FindIt
  POST_NOT_ACTIVE: 'This post is archived and no longer takes claims.',
  POST_RESOLVED: 'This post is already resolved — undo the resolution to change it.',
  ALREADY_RESOLVED: 'This post already has a resolution. Change it instead of creating a new one.',
  POST_HAS_PENDING_CLAIMS: 'A claim is still waiting for a decision — resolve the post before deleting it.',
  CLAIM_LOCKED: 'This claim is already decided and cannot be withdrawn.',
  TOO_MANY_IMAGES: 'You can attach at most 5 images per post.',
  // Notice Hub
  NOTICE_NOT_ACTIVE: 'Doubts can only be asked on active notices.',
  NOTICE_ALREADY_PUBLISHED: 'The publish time can only be changed while the notice is still scheduled.',
  DOUBT_ANSWERED: 'This doubt is already answered and cannot be edited.',
  ALREADY_ANSWERED: 'This doubt already has a response — edit the response instead.',
  // DocDesk
  DOC_TYPE_ARCHIVED: 'This document type no longer takes new requests.',
  REQUEST_NOT_PENDING: 'This request is already answered or closed.',
  NOT_ANSWERED: 'This request has not been answered yet.',
  NO_DOCUMENT: 'The answer has no document to fill in.',
  ALREADY_ACKNOWLEDGED: 'This request is already closed.',
  // FixIt
  TICKET_NOT_OPEN: 'Only open tickets can be edited or withdrawn.',
  TICKET_RESOLVED: 'Reopen the ticket before setting a turnaround time.',
  NOT_RESOLVED: 'There is nothing to acknowledge yet — the ticket is not resolved.',
};

interface FieldDetail {
  field?: string;
  message?: string;
}

function fieldDetails(details: unknown): FieldDetail[] {
  if (!Array.isArray(details)) return [];
  return details.filter(
    (d): d is FieldDetail => !!d && typeof d === 'object',
  );
}

export function friendlyMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return FRIENDLY[error.code] ?? error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}

export function ApiErrorMessage({ error }: { error: unknown }) {
  if (!error) return null;
  const details = error instanceof ApiError ? fieldDetails(error.details) : [];
  return (
    <div
      role="alert"
      className="flex gap-3 rounded-2xl border border-red-500/25 bg-red-50 px-4 py-3.5 text-sm text-red-900 shadow-card dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-200"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-red-100 text-red-600 dark:bg-red-400/15 dark:text-red-300">
        <Icon name="alert" className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="font-semibold">{friendlyMessage(error)}</div>
        {details.length > 0 && (
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[13px]">
            {details.map((d, i) => (
              <li key={i}>
                {d.field ? <span className="font-mono font-semibold">{d.field}</span> : null}
                {d.field && d.message ? ': ' : null}
                {d.message ?? JSON.stringify(d)}
              </li>
            ))}
          </ul>
        )}
        {error instanceof ApiError && (
          <div className="mt-1.5 font-mono text-[11px] text-red-400/80 dark:text-red-300/60">
            {error.code}
            {error.requestId ? ` · ref ${error.requestId.slice(0, 8)}` : ''}
          </div>
        )}
      </div>
    </div>
  );
}
