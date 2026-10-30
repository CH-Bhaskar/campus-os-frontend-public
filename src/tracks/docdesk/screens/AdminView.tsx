/**
 * DocDesk — admin view. Admins are READ-ONLY in DocDesk (writes → 403),
 * so this renders a full table + detail with zero write buttons.
 */
import { useCallback, useEffect, useState } from 'react';
import type { DocRequest, DocRequestStatus } from '../api/types';
import { getDocRequest, listDocRequests } from '../api/docdesk';
import { ApiErrorMessage } from '../components/ApiErrorMessage';
import {
  Avatar,
  Button,
  Card,
  Icon,
  Select,
  Field,
} from '../components/ui';
import {
  DetailSkeleton,
  ListSkeleton,
  PagedList,
  RequestTimeline,
  RequestsEmpty,
  StatusPill,
  TatBadge,
  usePaged,
} from './shared';
import { toIST, toISTDate } from '../utils/dates';

function AdminDetail({ requestId, onBack }: { requestId: string; onBack: () => void }) {
  const [req, setReq] = useState<DocRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

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

  if (loading) return <DetailSkeleton />;
  if (error || !req)
    return (
      <Card className="p-6">
        <ApiErrorMessage error={error ?? new Error('Request not found')} />
        <div className="mt-4">
          <Button variant="secondary" onClick={onBack}>
            <Icon name="arrowL" className="h-4 w-4" /> Back
          </Button>
        </div>
      </Card>
    );

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <Icon name="arrowL" className="h-4 w-4" /> Back to all requests
      </Button>
      <Card className="p-6">
        <div className="flex items-center gap-3">
          <Avatar name={req.requested_by_name} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-desk-ink dark:text-white">
                {req.doc_type_name}
              </h2>
              <StatusPill status={req.status} />
            </div>
            <div className="mt-0.5 text-sm text-desk-ink/55 dark:text-stone-400">
              {req.requested_by_name} · {req.requested_by_role}
              {req.requested_by_dept ? ` · ${req.requested_by_dept}` : ''}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <TatBadge req={req} />
              <span className="text-xs text-desk-ink/40 dark:text-stone-500">
                Requested {toIST(req.created_at)}
              </span>
            </div>
          </div>
        </div>
        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <RequestTimeline req={req} />
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 text-[11px] font-bold tracking-[0.16em] text-amber-600 uppercase dark:text-amber-400">
                Reason
              </h3>
              <p className="rounded-xl bg-desk-bg px-4 py-3 text-sm leading-relaxed text-desk-ink/75 dark:bg-slate-900 dark:text-stone-300">
                {req.reason}
              </p>
            </div>
            {req.answer ? (
              <div>
                <h3 className="mb-2 text-[11px] font-bold tracking-[0.16em] text-amber-600 uppercase dark:text-amber-400">
                  Answer
                </h3>
                <p className="rounded-xl bg-desk-bg px-4 py-3 text-sm leading-relaxed text-desk-ink/75 dark:bg-slate-900 dark:text-stone-300">
                  {req.answer.message}
                  <span className="mt-2 block text-xs text-desk-ink/50 dark:text-stone-400">
                    {req.answer.answered_by_name} · {toIST(req.answer.answered_at)}
                  </span>
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  );
}

export function AdminView() {
  const [status, setStatus] = useState<DocRequestStatus | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const paged = usePaged<DocRequest>(
    useCallback(
      (cursor?: string) =>
        listDocRequests({ status: status === 'all' ? undefined : status, limit: 15, cursor }),
      [status],
    ),
    [status],
  );

  if (selectedId) return <AdminDetail requestId={selectedId} onBack={() => setSelectedId(null)} />;

  return (
    <div className="space-y-4">
      <Card className="flex items-start gap-3 border-amber-500/30 p-4 dark:border-amber-400/30">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
          <Icon name="shield" className="h-4 w-4" />
        </span>
        <p className="text-sm leading-relaxed text-desk-ink/65 dark:text-stone-300">
          <span className="font-semibold text-desk-ink dark:text-white">Read-only access.</span>{' '}
          Admins can see every document request, but creating, answering or uploading in DocDesk
          belongs to Student Affairs — those actions return 403 for admins.
        </p>
      </Card>

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value as DocRequestStatus | 'all')}>
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="answered">Answered</option>
            <option value="acknowledged">Closed</option>
          </Select>
        </Field>
      </div>

      {paged.loading ? (
        <ListSkeleton />
      ) : (
        <PagedList
          paged={paged}
          keyOf={(r) => r.request_id}
          empty={<RequestsEmpty title="No requests yet" hint="Document requests from students and staff will appear here." />}
          renderItem={(r) => (
            <button
              onClick={() => setSelectedId(r.request_id)}
              className="block w-full cursor-pointer rounded-2xl border border-desk-ink/8 bg-white p-4 text-left shadow-desk transition-all duration-200 hover:-translate-y-px hover:shadow-desk-lg dark:border-white/8 dark:bg-slate-800"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={r.requested_by_name} className="h-8 w-8 text-xs" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-[16px] font-semibold tracking-tight text-desk-ink dark:text-white">
                        {r.doc_type_name}
                      </span>
                      <StatusPill status={r.status} />
                    </div>
                    <div className="truncate text-[13px] text-desk-ink/55 dark:text-stone-400">
                      {r.requested_by_name} · {r.requested_by_role}
                      {r.requested_by_dept ? ` · ${r.requested_by_dept}` : ''}
                    </div>
                  </div>
                </div>
                <Icon name="chevR" className="h-5 w-5 shrink-0 text-desk-ink/30 dark:text-stone-500" />
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-11">
                <TatBadge req={r} />
                <span className="text-xs text-desk-ink/40 dark:text-stone-500">{toISTDate(r.created_at)}</span>
              </div>
            </button>
          )}
        />
      )}
    </div>
  );
}

