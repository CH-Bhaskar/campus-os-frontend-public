/**
 * DocDesk — Student Affairs console.
 * Queue of all requests with filters + bulk TAT, per-request TAT/answer
 * management, filled-form downloads. Document types live in DocTypesManager.
 */
import { useCallback, useEffect, useState } from 'react';
import type { DocRequest, DocRequestStatus } from '../api/types';
import { ApiError } from '../api/client';
import {
  answerDocRequest,
  downloadFilledForm,
  getDocRequest,
  listDocRequests,
  setBulkTat,
  setDocRequestTat,
  updateAnswer,
  withdrawAnswer,
} from '../api/docdesk';
import { ApiErrorMessage } from '../components/ApiErrorMessage';
import {
  Avatar,
  Badge,
  Button,
  Card,
  Field,
  Icon,
  Input,
  Select,
  Textarea,
} from '../components/ui';
import { saveBlob } from '../utils/files';
import { todayISODate, toIST, toISTDate } from '../utils/dates';
import { DocTypesManager } from './DocTypesManager';
import {
  ConfirmModal,
  DetailSkeleton,
  PagedList,
  RequestTimeline,
  RequestsEmpty,
  StatusPill,
  TatBadge,
  usePaged,
} from './shared';

/** Pull failed request ids out of a bulk-TAT ApiError (details.request_ids). */
function bulkFailedIds(error: unknown): string[] {
  if (error instanceof ApiError) {
    const d = error.details as { request_ids?: unknown } | null | undefined;
    if (d && Array.isArray(d.request_ids))
      return d.request_ids.filter((x): x is string => typeof x === 'string');
  }
  return [];
}

/* ================= Queue row ================= */

function QueueRow({
  req,
  selected,
  onToggle,
  onOpen,
}: {
  req: DocRequest;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const selectable = req.status === 'pending';
  return (
    <div
      className={`rounded-2xl border bg-white shadow-card transition-all duration-200 dark:bg-night-800 ${
        selected
          ? 'border-ivy-600 ring-2 ring-ivy-500/25 dark:border-ivy-400'
          : 'border-ink/8 hover:-translate-y-px hover:shadow-lift dark:border-white/8'
      }`}
    >
      <div className="flex items-start gap-3 p-4">
        <input
          type="checkbox"
          checked={selected}
          disabled={!selectable}
          onChange={onToggle}
          title={selectable ? 'Select for bulk TAT' : 'Only pending requests can get a TAT'}
          className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-ivy-700 disabled:cursor-not-allowed disabled:opacity-30"
        />
        <button onClick={onOpen} className="min-w-0 flex-1 cursor-pointer text-left">
          <div className="flex flex-wrap items-center gap-2">
            <Avatar name={req.requested_by_name} className="h-8 w-8 text-xs" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-ink dark:text-white">
                {req.requested_by_name}
                <span className="ml-2 font-normal text-ink/45 dark:text-stone-400">
                  {req.requested_by_role}
                  {req.requested_by_dept ? ` · ${req.requested_by_dept}` : ''}
                </span>
              </div>
              <div className="truncate text-[13px] text-ink/55 dark:text-stone-400">
                <span className="font-medium text-ink/75 dark:text-stone-200">{req.doc_type_name}</span>
                {' — '}
                {req.reason}
              </div>
            </div>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-11">
            <StatusPill status={req.status} />
            <TatBadge req={req} />
            {req.filled_form ? (
              <Badge tone="violet">
                <Icon name="check" className="h-3 w-3" /> Form returned
              </Badge>
            ) : null}
            <span className="text-xs text-ink/40 dark:text-stone-500">{toISTDate(req.created_at)}</span>
          </div>
        </button>
      </div>
    </div>
  );
}

/* ================= Queue ================= */

function Queue({ onOpen }: { onOpen: (id: string) => void }) {
  const [status, setStatus] = useState<DocRequestStatus | 'all'>('pending');
  const [mine, setMine] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDate, setBulkDate] = useState(todayISODate());
  const [bulkNote, setBulkNote] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<unknown>(null);
  const [bulkFailed, setBulkFailed] = useState<string[]>([]);

  const paged = usePaged<DocRequest>(
    useCallback(
      (cursor?: string) =>
        listDocRequests({
          status: status === 'all' ? undefined : status,
          mine: mine || undefined,
          limit: 15,
          cursor,
        }),
      [status, mine],
    ),
    [status, mine],
  );

  // Drop selections that are no longer on screen / no longer pending.
  useEffect(() => {
    setSelected((prev) => {
      const visible = new Set(paged.items.filter((r) => r.status === 'pending').map((r) => r.request_id));
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [paged.items]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const applyBulkTat = async () => {
    if (selected.size === 0 || bulkBusy || !bulkDate) return;
    setBulkBusy(true);
    setBulkError(null);
    setBulkFailed([]);
    try {
      await setBulkTat({
        request_ids: [...selected],
        expected_by: bulkDate,
        note: bulkNote.trim() || undefined,
      });
      setSelected(new Set());
      setBulkNote('');
      paged.reload();
    } catch (e) {
      setBulkError(e);
      setBulkFailed(bulkFailedIds(e));
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value as DocRequestStatus | 'all')}>
            <option value="pending">Pending</option>
            <option value="answered">Answered</option>
            <option value="acknowledged">Closed</option>
            <option value="all">All</option>
          </Select>
        </Field>
        <label className="flex cursor-pointer items-center gap-2 pb-2.5 text-sm font-medium text-ink/70 dark:text-stone-300">
          <input
            type="checkbox"
            checked={mine}
            onChange={(e) => setMine(e.target.checked)}
            className="h-4 w-4 accent-ivy-700"
          />
          Only requests I filed
        </label>
        <div className="ml-auto pb-1 text-xs text-ink/45 dark:text-stone-500">
          Tip: tick pending requests, pick a date, hit <span className="font-semibold">Set TAT</span> — one call for up to 100.
        </div>
      </Card>

      {selected.size > 0 ? (
        <Card className="border-ivy-600/30 p-4 dark:border-ivy-400/30">
          <div className="flex flex-wrap items-end gap-3">
            <div className="text-sm font-semibold text-ink dark:text-white">
              {selected.size} selected
            </div>
            <Field label="Expected by">
              <Input
                type="date"
                value={bulkDate}
                min={todayISODate()}
                onChange={(e) => setBulkDate(e.target.value)}
              />
            </Field>
            <div className="min-w-52 flex-1">
              <Field label="Note (optional)">
                <Input
                  value={bulkNote}
                  onChange={(e) => setBulkNote(e.target.value)}
                  placeholder="e.g. Waiting for the principal's signature"
                />
              </Field>
            </div>
            <Button onClick={applyBulkTat} disabled={bulkBusy || !bulkDate} className="mb-0.5">
              <Icon name="calendar" className="h-4 w-4" />
              {bulkBusy ? 'Setting…' : `Set TAT for ${selected.size}`}
            </Button>
            <Button variant="ghost" size="sm" className="mb-1" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
          {bulkFailed.length > 0 ? (
            <div className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900 dark:bg-red-400/10 dark:text-red-200">
              <span className="font-semibold">All-or-nothing:</span> nothing was changed because
              these are missing or no longer pending — unselect them and retry:
              <div className="mt-1 font-mono text-xs">{bulkFailed.join(', ')}</div>
            </div>
          ) : null}
          <div className="mt-3">
            <ApiErrorMessage error={bulkError} />
          </div>
        </Card>
      ) : null}

      <PagedList
        paged={paged}
        keyOf={(r) => r.request_id}
        empty={
          <RequestsEmpty
            title="Queue is clear"
            hint={
              status === 'pending'
                ? 'No pending requests right now. New student requests will land here.'
                : 'No requests match this filter.'
            }
          />
        }
        renderItem={(r) => (
          <QueueRow
            req={r}
            selected={selected.has(r.request_id)}
            onToggle={() => toggle(r.request_id)}
            onOpen={() => onOpen(r.request_id)}
          />
        )}
      />
    </div>
  );
}

/* ================= Staff detail ================= */

function TatForm({ req, onSaved }: { req: DocRequest; onSaved: (r: DocRequest) => void }) {
  const [date, setDate] = useState(req.tat?.expected_by ?? todayISODate());
  const [note, setNote] = useState(req.tat?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const save = async () => {
    if (!date || busy) return;
    setBusy(true);
    setError(null);
    try {
      onSaved(await setDocRequestTat(req.request_id, { expected_by: date, note: note.trim() || undefined }));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl bg-paper p-4 dark:bg-night-900">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Expected by">
          <Input type="date" value={date} min={todayISODate()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <div className="min-w-44 flex-1">
          <Field label="Note (optional)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Waiting for signature" />
          </Field>
        </div>
        <Button size="sm" onClick={save} disabled={busy || !date}>
          {busy ? 'Saving…' : req.tat ? 'Replace TAT' : 'Set TAT'}
        </Button>
      </div>
      <div className="mt-2">
        <ApiErrorMessage error={error} />
      </div>
    </div>
  );
}

function AnswerComposer({
  req,
  onSaved,
}: {
  req: DocRequest;
  onSaved: (r: DocRequest) => void;
}) {
  const editing = !!req.answer;
  const [message, setMessage] = useState(req.answer?.message ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [removeDoc, setRemoveDoc] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const valid = message.trim().length >= 1 && message.trim().length <= 2000;

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = editing
        ? await updateAnswer(req.request_id, {
            message: message.trim(),
            document: file ?? undefined,
            remove_document: removeDoc || undefined,
          })
        : await answerDocRequest(req.request_id, { message: message.trim(), document: file ?? undefined });
      onSaved(updated);
      setFile(null);
      setRemoveDoc(false);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl bg-paper p-4 dark:bg-night-900">
      <Field
        label={editing ? 'Answer message' : 'Your answer'}
        hint={`${message.trim().length}/2000 · covers every outcome: "Ready, collect it after 2pm", "Not issued: fee receipt missing", or "Fill in the attached form and upload it back".`}
      >
        <Textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-ink/10 bg-white px-3.5 py-2 text-sm font-medium text-ink transition hover:border-ink/20 dark:border-white/10 dark:bg-night-800 dark:text-stone-100">
          <Icon name="plus" className="h-4 w-4" />
          {file ? file.name : req.document ? 'Replace document' : 'Attach document (optional)'}
          <input
            type="file"
            className="hidden"
            accept=".pdf,.docx"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setRemoveDoc(false);
              e.target.value = '';
            }}
          />
        </label>
        <span className="text-xs text-ink/45 dark:text-stone-500">PDF or DOCX, up to 10 MB</span>
        {editing && req.document ? (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink/65 dark:text-stone-300">
            <input
              type="checkbox"
              checked={removeDoc}
              onChange={(e) => {
                setRemoveDoc(e.target.checked);
                if (e.target.checked) setFile(null);
              }}
              className="h-4 w-4 accent-red-600"
            />
            Remove current document
            <span className="text-xs text-ink/40">(also removes the filled form)</span>
          </label>
        ) : null}
      </div>
      <ApiErrorMessage error={error} />
      <div className="flex justify-end">
        <Button onClick={save} disabled={!valid || busy}>
          {busy ? 'Saving…' : editing ? 'Update answer' : 'Send answer'}
        </Button>
      </div>
    </div>
  );
}

export function StaffDetail({
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
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

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

  const saved = (r: DocRequest) => {
    setReq(r);
    onChanged();
  };

  const downloadForm = async () => {
    if (!req?.filled_form) return;
    setBusy('dl');
    setActionError(null);
    try {
      saveBlob(await downloadFilledForm(req.request_id), req.filled_form.filename);
    } catch (e) {
      setActionError(e);
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <DetailSkeleton />;
  if (error || !req)
    return (
      <Card className="p-6">
        <ApiErrorMessage error={error ?? new Error('Request not found')} />
        <div className="mt-4">
          <Button variant="secondary" onClick={onBack}>
            <Icon name="arrowL" className="h-4 w-4" /> Back to queue
          </Button>
        </div>
      </Card>
    );

  const pending = req.status === 'pending';
  const answered = req.status === 'answered';
  const closed = req.status === 'acknowledged';

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <Icon name="arrowL" className="h-4 w-4" /> Back to queue
      </Button>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Avatar name={req.requested_by_name} />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-2xl font-semibold tracking-tight text-ink dark:text-white">
                  {req.doc_type_name}
                </h2>
                <StatusPill status={req.status} />
              </div>
              <div className="mt-0.5 text-sm text-ink/55 dark:text-stone-400">
                {req.requested_by_name} · {req.requested_by_role}
                {req.requested_by_dept ? ` · ${req.requested_by_dept}` : ''} · {req.requested_by_phone_number}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <TatBadge req={req} />
                <span className="text-xs text-ink/40 dark:text-stone-500">
                  Requested {toIST(req.created_at)}
                </span>
                <span className="font-mono text-[11px] text-ink/35 dark:text-stone-500">{req.request_id}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_1.3fr]">
          <div className="space-y-5">
            <div>
              <h3 className="mb-3 text-[11px] font-bold tracking-[0.16em] text-brass-600 uppercase dark:text-brass-400">
                Progress
              </h3>
              <RequestTimeline req={req} />
            </div>
            <div>
              <h3 className="mb-2 text-[11px] font-bold tracking-[0.16em] text-brass-600 uppercase dark:text-brass-400">
                Requester's reason
              </h3>
              <p className="rounded-xl bg-paper px-4 py-3 text-sm leading-relaxed text-ink/75 dark:bg-night-900 dark:text-stone-300">
                {req.reason}
              </p>
            </div>
          </div>

          <div className="space-y-5">
            {pending || (answered && req.tat) ? (
              <div>
                <h3 className="mb-2 text-[11px] font-bold tracking-[0.16em] text-brass-600 uppercase dark:text-brass-400">
                  Turnaround time
                </h3>
                {pending ? (
                  <TatForm req={req} onSaved={saved} />
                ) : req.tat ? (
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-paper px-4 py-3 text-sm dark:bg-night-900">
                    <span className="text-ink/70 dark:text-stone-300">
                      Due <span className="font-semibold">{req.tat.expected_by}</span>
                      {req.tat.note ? ` — ${req.tat.note}` : ''}
                    </span>
                    <TatBadge req={req} />
                  </div>
                ) : null}
              </div>
            ) : null}

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[11px] font-bold tracking-[0.16em] text-brass-600 uppercase dark:text-brass-400">
                  Answer
                </h3>
                {answered ? (
                  <Button variant="ghost" size="sm" onClick={() => setConfirmWithdraw(true)}>
                    <Icon name="trash" className="h-4 w-4" /> Withdraw answer
                  </Button>
                ) : null}
              </div>
              {closed ? (
                <div className="rounded-xl border border-ivy-600/20 bg-ivy-50 px-4 py-3 text-sm dark:border-ivy-400/20 dark:bg-ivy-400/5">
                  <p className="leading-relaxed text-ink/80 dark:text-stone-200">{req.answer?.message}</p>
                  <p className="mt-2 text-xs text-ink/50 dark:text-stone-400">
                    Closed — the answer can no longer be changed.
                  </p>
                </div>
              ) : (
                <AnswerComposer req={req} onSaved={saved} />
              )}
            </div>

            {req.filled_form ? (
              <div>
                <h3 className="mb-2 text-[11px] font-bold tracking-[0.16em] text-brass-600 uppercase dark:text-brass-400">
                  Filled form from requester
                </h3>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-violet-500/25 bg-violet-50 px-4 py-3 dark:bg-violet-400/10">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300">
                      <Icon name="fileText" className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <Badge tone="violet">Returned for verification</Badge>
                      <div className="mt-0.5 truncate text-sm font-medium text-ink dark:text-white">
                        {req.filled_form.filename}
                      </div>
                    </div>
                  </div>
                  <Button size="sm" variant="secondary" onClick={downloadForm} disabled={busy === 'dl'}>
                    {busy === 'dl' ? 'Saving…' : 'Download'}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-4">
          <ApiErrorMessage error={actionError} />
        </div>
      </Card>

      {confirmWithdraw ? (
        <ConfirmModal
          title="Withdraw this answer?"
          body="The request goes back to pending. The answer document AND the requester's filled form will be deleted."
          confirmLabel="Withdraw answer"
          danger
          busy={busy === 'withdraw-answer'}
          onCancel={() => setConfirmWithdraw(false)}
          onConfirm={async () => {
            setBusy('withdraw-answer');
            setActionError(null);
            try {
              saved(await withdrawAnswer(req.request_id));
              setConfirmWithdraw(false);
            } catch (e) {
              setActionError(e);
              setConfirmWithdraw(false);
            } finally {
              setBusy(null);
            }
          }}
        />
      ) : null}
    </div>
  );
}

/* ================= Top-level staff console ================= */

export function StaffConsole() {
  const [tab, setTab] = useState<'queue' | 'types'>('queue');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [queueKey, setQueueKey] = useState(0);

  if (selectedId) {
    return (
      <StaffDetail
        requestId={selectedId}
        onBack={() => {
          setSelectedId(null);
          setQueueKey((k) => k + 1);
        }}
        onChanged={() => setQueueKey((k) => k + 1)}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={tab === 'queue' ? 'primary' : 'secondary'}
          onClick={() => setTab('queue')}
        >
          <Icon name="inbox" className="h-4 w-4" /> Request queue
        </Button>
        <Button size="sm" variant={tab === 'types' ? 'primary' : 'secondary'} onClick={() => setTab('types')}>
          <Icon name="fileText" className="h-4 w-4" /> Document types
        </Button>
      </div>
      {tab === 'queue' ? (
        <div key={queueKey}>
          <Queue onOpen={setSelectedId} />
        </div>
      ) : (
        <DocTypesManager />
      )}
    </div>
  );
}

