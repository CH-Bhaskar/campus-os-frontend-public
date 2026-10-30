/**
 * DocDesk — document requests. Base path: /api/v1/docdesk
 *
 * Flow: pending ──answer──▶ answered ──acknowledge──▶ acknowledged (closed)
 *  - request: student, faculty, office_staff  (⚠️ ADMIN IS READ-ONLY HERE — writes → 403)
 *  - answer / TAT / doc types: Student Affairs staff only
 *  - see requests: Student Affairs + admin see all; others see own
 */
import { api, apiBlob, toFormData } from './client';
import type {
  DocRequest,
  DocRequestStatus,
  DocType,
  FoundPostStatus,
  Page,
} from './types';

/* ---------------- Requests (core) ---------------- */

/**
 * POST /api/v1/docdesk/requests — student, faculty, office_staff. JSON → 201.
 * reason: 5–1000 chars. Archived doc type → 409 DOC_TYPE_ARCHIVED.
 */
export function createDocRequest(doc_type_id: string, reason: string): Promise<DocRequest> {
  return api<DocRequest>('/api/v1/docdesk/requests', {
    method: 'POST',
    body: { doc_type_id, reason },
  });
}

export interface ListDocRequestsParams {
  status?: DocRequestStatus;
  doc_type_id?: string;
  mine?: boolean;
  limit?: number;
  cursor?: string;
}

/** GET /api/v1/docdesk/requests — everyone (Student Affairs + admin see all, others own). */
export function listDocRequests(params: ListDocRequestsParams = {}): Promise<Page<DocRequest>> {
  return api<Page<DocRequest>>('/api/v1/docdesk/requests', { query: { ...params } });
}

/** GET /api/v1/docdesk/requests/{request_id} — requester, Student Affairs, admin. */
export function getDocRequest(request_id: string): Promise<DocRequest> {
  return api<DocRequest>(`/api/v1/docdesk/requests/${encodeURIComponent(request_id)}`);
}

/**
 * PATCH /api/v1/docdesk/requests/{request_id} — requester. JSON.
 * Only while pending. Any of: doc_type_id, reason.
 */
export function updateDocRequest(
  request_id: string,
  patch: { doc_type_id?: string; reason?: string },
): Promise<DocRequest> {
  return api<DocRequest>(`/api/v1/docdesk/requests/${encodeURIComponent(request_id)}`, {
    method: 'PATCH',
    body: patch,
  });
}

/** DELETE /api/v1/docdesk/requests/{request_id} — requester. Withdraw, only while pending. */
export function withdrawDocRequest(request_id: string): Promise<{ message: string }> {
  return api<{ message: string }>(`/api/v1/docdesk/requests/${encodeURIComponent(request_id)}`, {
    method: 'DELETE',
  });
}

/* ---------------- Answers (Student Affairs) ---------------- */

/**
 * POST /api/v1/docdesk/requests/{request_id}/answer — Student Affairs. form-data → 201.
 * message required (1–2000 chars, covers every outcome); document optional (PDF/DOCX ≤10MB).
 */
export function answerDocRequest(
  request_id: string,
  input: { message: string; document?: File },
): Promise<DocRequest> {
  return api<DocRequest>(`/api/v1/docdesk/requests/${encodeURIComponent(request_id)}/answer`, {
    method: 'POST',
    body: toFormData(input),
  });
}

/**
 * PATCH /api/v1/docdesk/requests/{request_id}/answer — Student Affairs. form-data.
 * Change the message / replace the document / remove_document=true.
 * Allowed until the request is acknowledged. Removing the document also removes the filled form.
 */
export function updateAnswer(
  request_id: string,
  patch: { message?: string; document?: File; remove_document?: boolean },
): Promise<DocRequest> {
  return api<DocRequest>(`/api/v1/docdesk/requests/${encodeURIComponent(request_id)}/answer`, {
    method: 'PATCH',
    body: toFormData(patch),
  });
}

/**
 * DELETE /api/v1/docdesk/requests/{request_id}/answer — Student Affairs.
 * Withdraws the answer (with its document and any filled form); request goes back to pending.
 */
export function withdrawAnswer(request_id: string): Promise<DocRequest> {
  return api<DocRequest>(`/api/v1/docdesk/requests/${encodeURIComponent(request_id)}/answer`, {
    method: 'DELETE',
  });
}

/**
 * POST /api/v1/docdesk/requests/{request_id}/acknowledge — requester. No body.
 * Closes the request (status → acknowledged).
 */
export function acknowledgeRequest(request_id: string): Promise<DocRequest> {
  return api<DocRequest>(`/api/v1/docdesk/requests/${encodeURIComponent(request_id)}/acknowledge`, {
    method: 'POST',
  });
}

/* ---------------- ⭐ Document types (bonus) ---------------- */

/**
 * ⭐ GET /api/v1/docdesk/doc-types — everyone.
 * Fill the "Document type" dropdown from this instead of hard-coding it.
 */
export function listDocTypes(
  params: { status?: FoundPostStatus; limit?: number; cursor?: string } = {},
): Promise<Page<DocType>> {
  return api<Page<DocType>>('/api/v1/docdesk/doc-types', {
    query: { status: params.status ?? 'active', limit: params.limit, cursor: params.cursor },
  });
}

/** ⭐ GET /api/v1/docdesk/doc-types/{doc_type_id} — everyone. */
export function getDocType(doc_type_id: string): Promise<DocType> {
  return api<DocType>(`/api/v1/docdesk/doc-types/${encodeURIComponent(doc_type_id)}`);
}

/**
 * ⭐ POST /api/v1/docdesk/doc-types — Student Affairs. → 201.
 * name: 3–80 chars, unique (dupes → 409 ALREADY_EXISTS).
 */
export function createDocType(name: string, description?: string): Promise<DocType> {
  return api<DocType>('/api/v1/docdesk/doc-types', {
    method: 'POST',
    body: { name, description },
  });
}

/**
 * ⭐ PATCH /api/v1/docdesk/doc-types/{doc_type_id} — Student Affairs.
 * Any of: name, description, status. status='archived' stops new requests for the type.
 */
export function updateDocType(
  doc_type_id: string,
  patch: { name?: string; description?: string | null; status?: FoundPostStatus },
): Promise<DocType> {
  return api<DocType>(`/api/v1/docdesk/doc-types/${encodeURIComponent(doc_type_id)}`, {
    method: 'PATCH',
    body: patch,
  });
}

/** ⭐ DELETE /api/v1/docdesk/doc-types/{doc_type_id} — Student Affairs. */
export function deleteDocType(doc_type_id: string): Promise<{ message: string }> {
  return api<{ message: string }>(`/api/v1/docdesk/doc-types/${encodeURIComponent(doc_type_id)}`, {
    method: 'DELETE',
  });
}

/* ---------------- ⭐ Turnaround time (bonus) ---------------- */

/**
 * ⭐ PUT /api/v1/docdesk/requests/{request_id}/tat — Student Affairs.
 * expected_by: YYYY-MM-DD, can't be before today. Sending again replaces the old value.
 */
export function setDocRequestTat(
  request_id: string,
  input: { expected_by: string; note?: string },
): Promise<DocRequest> {
  return api<DocRequest>(`/api/v1/docdesk/requests/${encodeURIComponent(request_id)}/tat`, {
    method: 'PUT',
    body: input,
  });
}

export interface BulkTatResult {
  items: DocRequest[];
  count: number;
}

/**
 * ⭐ POST /api/v1/docdesk/requests/bulk-tat — Student Affairs.
 * Set TAT on 1–100 requests at once. ALL OR NOTHING: if any id is missing (404)
 * or not pending (409 REQUEST_NOT_PENDING), nothing changes and
 * error.details.request_ids lists the bad ids — unselect them and retry.
 * UI idea: checkboxes on the pending list + a date picker + one "Set TAT" button.
 */
export function setBulkTat(input: {
  request_ids: string[];
  expected_by: string;
  note?: string;
}): Promise<BulkTatResult> {
  return api<BulkTatResult>('/api/v1/docdesk/requests/bulk-tat', { method: 'POST', body: input });
}

/* ---------------- ⭐ Documents & filled forms (bonus) ---------------- */

/**
 * ⭐ GET /api/v1/docdesk/requests/{request_id}/document — requester, Student Affairs, admin.
 * Returns the file itself. Use for download buttons (preview urls expire in ~15 min).
 */
export function downloadAnswerDocument(request_id: string): Promise<Blob> {
  return apiBlob(`/api/v1/docdesk/requests/${encodeURIComponent(request_id)}/document`);
}

/**
 * ⭐ PUT /api/v1/docdesk/requests/{request_id}/filled-form — requester. form-data, one file
 * (PDF/DOCX/JPEG/PNG ≤10MB). Uploading again replaces it.
 * Only when answered AND the answer has a document:
 *   pending → 409 NOT_ANSWERED · no document → 409 NO_DOCUMENT · closed → 409 ALREADY_ACKNOWLEDGED.
 */
export function uploadFilledForm(request_id: string, file: File): Promise<DocRequest> {
  return api<DocRequest>(
    `/api/v1/docdesk/requests/${encodeURIComponent(request_id)}/filled-form`,
    { method: 'PUT', body: toFormData({ file }) },
  );
}

/** ⭐ GET /api/v1/docdesk/requests/{request_id}/filled-form — requester, Student Affairs, admin. */
export function downloadFilledForm(request_id: string): Promise<Blob> {
  return apiBlob(`/api/v1/docdesk/requests/${encodeURIComponent(request_id)}/filled-form`);
}

/**
 * ⭐ DELETE /api/v1/docdesk/requests/{request_id}/filled-form — requester.
 * Only before acknowledging.
 */
export function deleteFilledForm(request_id: string): Promise<DocRequest> {
  return api<DocRequest>(
    `/api/v1/docdesk/requests/${encodeURIComponent(request_id)}/filled-form`,
    { method: 'DELETE' },
  );
}
