/**
 * DocDesk — requester view (student, faculty, office_staff).
 * Tabs: document catalog → request modal · my requests → full detail with
 * timeline, answer download, filled-form round-trip, edit/withdraw, acknowledge.
 */
import { useCallback, useEffect, useState } from 'react';
import type { DocRequest, DocRequestStatus, DocType } from '../api/types';
import { ApiError } from '../api/client';
import {
  acknowledgeRequest,
  createDocRequest,
  deleteFilledForm,
  downloadAnswerDocument,
  downloadFilledForm,
  getDocRequest,
  listDocRequests,
  listDocTypes,
  updateDocRequest,
  uploadFilledForm,
  withdrawDocRequest,
} from '../api/docdesk';
import { ApiErrorMessage } from '../components/ApiErrorMessage';
import { EmptyState } from '../components/EmptyState';
import {
  Badge,
  Button,
  Card,
  Field,
  Icon,
  ModuleIcon,
  Select,
  Textarea,
} from '../components/ui';
import { saveBlob } from '../utils/files';
import { toIST, toISTDate } from '../utils/dates';
import {
  ConfirmModal,
  DetailSkeleton,
  Modal,
  PagedList,
  RequestTimeline,
  RequestsEmpty,
  StatusPill,
  TatBadge,
  usePaged,
} from './shared';

/* ================= Request modal (new request) ================= */

function RequestModal({
  docType,
  types,
  onClose,
  onCreated,
}: {
  docType: DocType;
  types: DocType[];
  onClose: () => void;
  onCreated: (req: DocRequest) => void;
}) {
  const [typeId, setTypeId] = useState(docType.doc_type_id);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const valid = reason.trim().length >= 5 && reason.trim().length <= 1000;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const req = await createDocRequest(typeId, reason.trim());
      onCreated(req);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Request a document" subtitle={docType.name} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Document type">
          <Select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            {types.map((t) => (
              <option key={t.doc_type_id} value={t.doc_type_id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Why do you need it?"
          hint={`${reason.trim().length}/1000 · minimum 5 characters — this helps Student Affairs prioritise.`}
        >
          <Textarea
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Needed for the scholarship application — deadline next Friday."
          />
        </Field>
        <ApiErrorMessage error={error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid || busy}>
            {busy ? 'Submitting…' : 'Submit request'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ================= Document catalog ================= */

function Catalog({ onRequested }: { onRequested: () => void }) {
  const [types, setTypes] = useState<DocType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [modalType, setModalType] = useState<DocType | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await listDocTypes({ status: 'active', limit: 100 });
      setTypes(page.items);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading)
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-44 animate-pulse rounded-2xl bg-ink/5 dark:bg-white/5" />
        ))}
      </div>
    );
  if (error)
    return (
      <Card className="p-6">
        <ApiErrorMessage error={error} />
        <div className="mt-3">
          <Button variant="secondary" size="sm" onClick={load}>
            Retry
          </Button>
        </div>
      </Card>
    );
  if (types.length === 0)
    return (
      <EmptyState
        icon="fileText"
        title="No document types yet"
        hint="Student Affairs hasn't published any document types. Check back soon."
      />
    );

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {types.map((t) => (
          <Card key={t.doc_type_id} hover className="flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <ModuleIcon module="docdesk" />
              <Badge tone="ivy">Available</Badge>
            </div>
            <h3 className="mt-3 font-display text-lg font-semibold tracking-tight text-ink dark:text-white">
              {t.name}
            </h3>
            {t.description ? (
              <p className="mt-1 flex-1 text-sm leading-relaxed text-ink/60 dark:text-stone-400">
                {t.description}
              </p>
            ) : (
              <div className="flex-1" />
            )}
            <Button className="mt-4 w-full" onClick={() => setModalType(t)}>
              <Icon name="plus" className="h-4 w-4" /> Request this document
            </Button>
          </Card>
        ))}
      </div>
      {modalType ? (
        <RequestModal
          docType={modalType}
          types={types}
          onClose={() => setModalType(null)}
          onCreated={() => {
            setModalType(null);
            onRequested();
          }}
        />
      ) : null}
    </>
  );
}

/* ================= Request row ================= */

function RequestRow({ req, onOpen }: { req: DocRequest; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="block w-full cursor-pointer rounded-2xl border border-ink/8 bg-white p-4 text-left shadow-card transition-all duration-200 hover:-translate-y-px hover:shadow-lift dark:border-white/8 dark:bg-night-800"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-[17px] font-semibold tracking-tight text-ink dark:text-white">
              {req.doc_type_name}
            </span>
            <StatusPill status={req.status} />
          </div>
          <p className="mt-1 truncate text-sm text-ink/55 dark:text-stone-400">{req.reason}</p>
        </div>
        <Icon name="chevR" className="h-5 w-5 shrink-0 text-ink/30 dark:text-stone-500" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <TatBadge req={req} />
        <Badge tone="slate">
          <Icon name="calendar" className="h-3 w-3" /> {toISTDate(req.created_at)}
        </Badge>
        <span className="font-mono text-[11px] text-ink/35 dark:text-stone-500">
          {req.request_id}
        </span>
      </div>
    </button>
  );
}

/* ================= My requests ================= */

const STATUS_FILTERS: { key: DocRequestStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'answered', label: 'Answered' },
  { key: 'acknowledged', label: 'Closed' },
];

function MyRequests({ onOpen }: { onOpen: (id: string) => void }) {
  const [filter, setFilter] = useState<DocRequestStatus | 'all'>('all');
  const paged = usePaged<DocRequest>(
    useCallback(
      (cursor?: string) =>
        listDocRequests({
          status: filter === 'all' ? undefined : filter,
          limit: 15,
          cursor,
        }),
      [filter],
    ),
    [filter],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <Button
            key={f.key}
            size="sm"
            variant={filter === f.key ? 'primary' : 'secondary'}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>
      <PagedList
        paged={paged}
        keyOf={(r) => r.request_id}
        empty={
          <RequestsEmpty
            title={filter === 'all' ? 'No requests yet' : `No ${filter} requests`}
            hint="Browse the document catalog and raise your first request — it takes less than a minute."
          />
        }
        renderItem={(r) => <RequestRow req={r} onOpen={() => onOpen(r.request_id)} />}
      />
    </div>
  );
}

/* ================= Requester detail ================= */

function FileRow({
  label,
  filename,
  onDownload,
  downloading,
  onDelete,
  deleting,
}: {
  label: string;
  filename: string;
  onDownload: () => void;
  downloading: boolean;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-ink/8 bg-paper px-4 py-3 dark:border-white/8 dark:bg-night-900">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300">
          <Icon name="fileText" className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="text-[11px] font-bold tracking-wider text-ink/45 uppercase dark:text-stone-500">
            {label}
          </div>
          <div className="truncate text-sm font-medium text-ink dark:text-white">{filename}</div>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button size="sm" variant="secondary" onClick={onDownload} disabled={downloading}>
          {downloading ? 'Saving…' : 'Download'}
        </Button>
        {onDelete ? (
          <Button size="sm" variant="ghost" onClick={onDelete} disabled={deleting}>
            <Icon name="trash" className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function RequesterDetail({
  requestId,
  onBack,
  onChanged,
}: {
  requestId: string;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [req, setReq] = useState<DocRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [confirm, setConfirm] = useState<'withdraw' | 'acknowledge' | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [types, setTypes] = useState<DocType[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReq(await getDocRequest(requestId));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    listDocTypes({ status: 'active', limit: 100 })
      .then((p) => setTypes(p.items))
      .catch(() => {});
  }, []);

  const run = async (label: string, fn: () => Promise<DocRequest | { message: string }>) => {
    setBusy(label);
    setActionError(null);
    try {
      const res = await fn();
      if ('request_id' in res) {
        setReq(res as DocRequest);
        onChanged();
      }
      return res;
    } catch (e) {
      setActionError(e);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const download = async (kind: 'document' | 'filled') => {
    if (!req) return;
    const label = `dl-${kind}`;
    setBusy(label);
    setActionError(null);
    try {
      const blob =
        kind === 'document'
          ? await downloadAnswerDocument(req.request_id)
          : await downloadFilledForm(req.request_id);
      const name =
        kind === 'document' ? (req.document?.filename ?? 'document') : (req.filled_form?.filename ?? 'filled-form');
      saveBlob(blob, name);
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(null);
    }
  };

  const upload = async (file: File) => {
    if (!req) return;
    await run('upload', () => uploadFilledForm(req.request_id, file));
  };

  if (loading) return <DetailSkeleton />;
  if (error || !req)
    return (
      <Card className="p-6">
        <ApiErrorMessage error={error ?? new Error('Request not found')} />
        <div className="mt-4">
          <Button variant="secondary" onClick={onBack}>
            <Icon name="arrowL" className="h-4 w-4" /> Back to requests
          </Button>
        </div>
      </Card>
    );

  const pending = req.status === 'pending';
  const canFill = req.status === 'answered' && !!req.document;

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <Icon name="arrowL" className="h-4 w-4" /> Back to my requests
      </Button>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-ink dark:text-white">
                {req.doc_type_name}
              </h2>
              <StatusPill status={req.status} />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-ink/55 dark:text-stone-400">
              <TatBadge req={req} />
              <span>Requested {toIST(req.created_at)}</span>
              <span className="font-mono text-[11px] text-ink/35 dark:text-stone-500">
                {req.request_id}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {pending ? (
              <>
                <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
                  <Icon name="pencil" className="h-4 w-4" /> Edit
                </Button>
                <Button variant="danger" size="sm" onClick={() => setConfirm('withdraw')}>
                  Withdraw
                </Button>
              </>
            ) : null}
            {req.status === 'answered' ? (
              <Button variant="brass" size="sm" onClick={() => setConfirm('acknowledge')}>
                <Icon name="check" className="h-4 w-4" /> Acknowledge & close
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <h3 className="mb-3 text-[11px] font-bold tracking-[0.16em] text-brass-600 uppercase dark:text-brass-400">
              Progress
            </h3>
            <RequestTimeline req={req} />
          </div>
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 text-[11px] font-bold tracking-[0.16em] text-brass-600 uppercase dark:text-brass-400">
                Your reason
              </h3>
              <p className="rounded-xl bg-paper px-4 py-3 text-sm leading-relaxed text-ink/75 dark:bg-night-900 dark:text-stone-300">
                {req.reason}
              </p>
            </div>

            {req.answer ? (
              <div>
                <h3 className="mb-2 text-[11px] font-bold tracking-[0.16em] text-brass-600 uppercase dark:text-brass-400">
                  Answer from Student Affairs
                </h3>
                <div className="rounded-xl border border-ivy-600/20 bg-ivy-50 px-4 py-3 dark:border-ivy-400/20 dark:bg-ivy-400/5">
                  <p className="text-sm leading-relaxed text-ink/80 dark:text-stone-200">
                    {req.answer.message}
                  </p>
                  <p className="mt-2 text-xs text-ink/50 dark:text-stone-400">
                    {req.answer.answered_by_name} · {toIST(req.answer.answered_at)}
                  </p>
                </div>
              </div>
            ) : null}

            {req.document ? (
              <FileRow
                label="Document to fill"
                filename={req.document.filename}
                downloading={busy === 'dl-document'}
                onDownload={() => download('document')}
              />
            ) : null}

            <div>
              <h3 className="mb-2 text-[11px] font-bold tracking-[0.16em] text-brass-600 uppercase dark:text-brass-400">
                Filled form
              </h3>
              {req.filled_form ? (
                <FileRow
                  label="Uploaded by you"
                  filename={req.filled_form.filename}
                  downloading={busy === 'dl-filled'}
                  onDownload={() => download('filled')}
                  onDelete={
                    req.status !== 'acknowledged'
                      ? () => run('delete-filled', () => deleteFilledForm(req.request_id))
                      : undefined
                  }
                  deleting={busy === 'delete-filled'}
                />
              ) : canFill ? (
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed border-ink/20 px-4 py-4 transition hover:border-ivy-500 hover:bg-ivy-50/50 dark:border-white/15 dark:hover:border-ivy-400 dark:hover:bg-ivy-400/5">
                  <span className="text-sm text-ink/60 dark:text-stone-400">
                    {busy === 'upload'
                      ? 'Uploading…'
                      : 'Fill in the document (or photograph the paper form) and upload it back — PDF, DOCX, JPG or PNG, up to 10 MB.'}
                  </span>
                  <span
                    className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-1.5 text-[13px] font-semibold transition-all duration-200 active:scale-[0.98] ${
                      busy === 'upload'
                        ? 'cursor-not-allowed opacity-50'
                        : ''
                    } border border-ink/10 bg-white text-ink shadow-card hover:-translate-y-px hover:bg-cream hover:shadow-lift dark:border-white/10 dark:bg-night-800 dark:text-stone-100 dark:hover:bg-night-700`}
                  >
                    <Icon name="plus" className="h-4 w-4" /> Upload
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.docx,.jpg,.jpeg,.png"
                    disabled={busy === 'upload'}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) upload(f);
                      e.target.value = '';
                    }}
                  />
                </label>
              ) : (
                <p className="rounded-xl bg-paper px-4 py-3 text-sm text-ink/50 dark:bg-night-900 dark:text-stone-400">
                  {req.status === 'pending'
                    ? 'You can upload the filled form once Student Affairs answers with a document.'
                    : 'This answer has no document to fill in.'}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <ApiErrorMessage error={actionError} />
        </div>
      </Card>

      {editOpen ? (
        <EditRequestModal
          req={req}
          types={types}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => {
            setEditOpen(false);
            setReq(updated);
            onChanged();
          }}
        />
      ) : null}

      {confirm === 'withdraw' ? (
        <ConfirmModal
          title="Withdraw this request?"
          body="The request will be cancelled. You can raise a new one any time."
          confirmLabel="Withdraw request"
          danger
          busy={busy === 'withdraw'}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            const res = await run('withdraw', () => withdrawDocRequest(req.request_id));
            if (res) onBack();
          }}
        />
      ) : null}

      {confirm === 'acknowledge' ? (
        <ConfirmModal
          title="Acknowledge & close?"
          body="Confirm everything is in order. The request will be closed and Student Affairs can no longer change the answer."
          confirmLabel="Acknowledge"
          busy={busy === 'ack'}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            const res = await run('ack', () => acknowledgeRequest(req.request_id));
            if (res) setConfirm(null);
          }}
        />
      ) : null}
    </div>
  );
}

function EditRequestModal({
  req,
  types,
  onClose,
  onSaved,
}: {
  req: DocRequest;
  types: DocType[];
  onClose: () => void;
  onSaved: (r: DocRequest) => void;
}) {
  const [typeId, setTypeId] = useState(req.doc_type_id);
  const [reason, setReason] = useState(req.reason);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const valid = reason.trim().length >= 5 && reason.trim().length <= 1000;

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      onSaved(await updateDocRequest(req.request_id, { doc_type_id: typeId, reason: reason.trim() }));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'REQUEST_NOT_PENDING') {
        setError(e);
      } else {
        setError(e);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Edit request" subtitle="Only possible while the request is pending." onClose={onClose}>
      <div className="space-y-4">
        <Field label="Document type">
          <Select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            {types.map((t) => (
              <option key={t.doc_type_id} value={t.doc_type_id}>
                {t.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reason" hint={`${reason.trim().length}/1000 · minimum 5 characters.`}>
          <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <ApiErrorMessage error={error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!valid || busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ================= Top-level requester view ================= */

export function RequesterView() {
  const [tab, setTab] = useState<'catalog' | 'mine'>('catalog');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mineKey, setMineKey] = useState(0);

  if (selectedId) {
    return (
      <RequesterDetail
        requestId={selectedId}
        onBack={() => {
          setSelectedId(null);
          setMineKey((k) => k + 1);
        }}
        onChanged={() => setMineKey((k) => k + 1)}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={tab === 'catalog' ? 'primary' : 'secondary'}
          onClick={() => setTab('catalog')}
        >
          <Icon name="fileText" className="h-4 w-4" /> Browse documents
        </Button>
        <Button size="sm" variant={tab === 'mine' ? 'primary' : 'secondary'} onClick={() => setTab('mine')}>
          <Icon name="inbox" className="h-4 w-4" /> My requests
        </Button>
      </div>
      {tab === 'catalog' ? (
        <Catalog
          onRequested={() => {
            setTab('mine');
            setMineKey((k) => k + 1);
          }}
        />
      ) : (
        <div key={mineKey}>
          <MyRequests onOpen={setSelectedId} />
        </div>
      )}
    </div>
  );
}
