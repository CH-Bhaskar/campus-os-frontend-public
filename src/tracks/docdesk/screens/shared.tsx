/**
 * DocDesk shared UI: modal, confirm dialog, status pills, TAT badges,
 * request timeline, cursor-paginated list hook, skeletons.
 * Built on the Ivy & Brass design primitives in components/ui.tsx.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { DocRequest, DocRequestStatus, Page, Turnaround } from '../api/types';
import { ApiErrorMessage } from '../components/ApiErrorMessage';
import { Badge, Button, Card, Icon } from '../components/ui';
import { Pagination } from '../components/Pagination';
import { EmptyState } from '../components/EmptyState';
import { todayISODate, toIST, toISTDate } from '../utils/dates';

/* ---------------- Modal ---------------- */

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/45 p-4 backdrop-blur-sm dark:bg-black/60"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <Card
        className={`w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} p-0`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink/8 px-6 py-4 dark:border-white/8">
          <div>
            <h2 className="font-display text-xl font-semibold tracking-tight text-ink dark:text-white">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-0.5 text-sm text-ink/55 dark:text-stone-400">{subtitle}</p>
            ) : null}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            <Icon name="x" className="h-4 w-4" />
          </Button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </Card>
    </div>
  );
}

export function ConfirmModal({
  title,
  body,
  confirmLabel = 'Confirm',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="text-sm leading-relaxed text-ink/70 dark:text-stone-300">{body}</div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
          {busy ? 'Working…' : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

/* ---------------- Status pills & TAT ---------------- */

const STATUS_META: Record<DocRequestStatus, { label: string; tone: 'amber' | 'sky' | 'emerald' }> = {
  pending: { label: 'Pending', tone: 'amber' },
  answered: { label: 'Answered', tone: 'sky' },
  acknowledged: { label: 'Closed', tone: 'emerald' },
};

export function StatusPill({ status }: { status: DocRequestStatus }) {
  const m = STATUS_META[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export interface TatState {
  label: string;
  tone: 'slate' | 'amber' | 'rose';
  overdue: boolean;
}

/** Countdown label for a TAT against today's IST date. */
export function tatState(tat: Turnaround | null | undefined, status: DocRequestStatus): TatState | null {
  if (!tat) return null;
  const today = todayISODate();
  const diff = Math.round(
    (Date.parse(tat.expected_by) - Date.parse(today)) / 86_400_000,
  );
  if (status === 'acknowledged') {
    return { label: `Was due ${tat.expected_by}`, tone: 'slate', overdue: false };
  }
  if (diff < 0)
    return { label: `Overdue by ${-diff}d`, tone: 'rose', overdue: true };
  if (diff === 0) return { label: 'Due today', tone: 'amber', overdue: false };
  if (diff === 1) return { label: 'Due tomorrow', tone: 'amber', overdue: false };
  return { label: `${diff} days left`, tone: 'amber', overdue: false };
}

export function TatBadge({ req }: { req: DocRequest }) {
  const s = tatState(req.tat, req.status);
  if (!s) {
    return (
      <Badge tone="slate">
        <Icon name="clock" className="h-3 w-3" /> No TAT set
      </Badge>
    );
  }
  return (
    <Badge tone={s.tone} title={req.tat?.note ?? undefined}>
      <Icon name={s.overdue ? 'alert' : 'clock'} className="h-3 w-3" />
      {s.label}
      {req.tat?.expected_by ? ` · ${req.tat.expected_by}` : ''}
    </Badge>
  );
}

/* ---------------- Timeline ---------------- */

function Step({
  done,
  current,
  title,
  detail,
}: {
  done: boolean;
  current?: boolean;
  title: string;
  detail?: ReactNode;
}) {
  return (
    <div className="relative flex gap-3.5 pb-6 last:pb-0">
      <div className="flex flex-col items-center">
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 ${
            done
              ? 'border-ivy-600 bg-ivy-600 text-white dark:border-ivy-400 dark:bg-ivy-400 dark:text-ivy-950'
              : current
                ? 'border-brass-500 bg-brass-100 text-brass-700 dark:bg-brass-400/15 dark:text-brass-300'
                : 'border-ink/15 bg-white text-ink/30 dark:border-white/15 dark:bg-night-800 dark:text-stone-600'
          }`}
        >
          <Icon name={done ? 'check' : current ? 'clock' : 'chevR'} className="h-4 w-4" />
        </span>
        <span className="w-0.5 flex-1 bg-ink/10 dark:bg-white/10" aria-hidden="true" />
      </div>
      <div className="min-w-0 pt-1">
        <div
          className={`text-sm font-semibold ${
            done || current ? 'text-ink dark:text-white' : 'text-ink/40 dark:text-stone-500'
          }`}
        >
          {title}
        </div>
        {detail ? (
          <div className="mt-0.5 text-[13px] leading-relaxed text-ink/55 dark:text-stone-400">
            {detail}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Vertical lifecycle timeline for a document request. */
export function RequestTimeline({ req }: { req: DocRequest }) {
  const pending = req.status === 'pending';
  const answered = req.status === 'answered' || req.status === 'acknowledged';
  const closed = req.status === 'acknowledged';
  return (
    <div>
      <Step
        done
        title="Request submitted"
        detail={`${toIST(req.created_at)} · ${req.doc_type_name}`}
      />
      <Step
        done={!!req.tat}
        current={pending && !req.tat}
        title="Turnaround time"
        detail={
          req.tat ? (
            <>
              Due <span className="font-semibold">{req.tat.expected_by}</span>
              {req.tat.note ? ` — ${req.tat.note}` : ''} · set {toISTDate(req.tat.updated_at)}
            </>
          ) : pending ? (
            'Waiting for Student Affairs to set an expected date.'
          ) : (
            'No turnaround was set.'
          )
        }
      />
      <Step
        done={answered}
        current={pending}
        title="Answered by Student Affairs"
        detail={
          req.answer ? (
            <>
              {req.answer.answered_by_name} · {toIST(req.answer.answered_at)}
              {req.document ? ` · with document “${req.document.filename}”` : ''}
            </>
          ) : pending ? (
            'Your request is in the queue.'
          ) : undefined
        }
      />
      {req.document ? (
        <Step
          done={!!req.filled_form || closed}
          current={answered && !req.filled_form && !closed}
          title="Filled form uploaded"
          detail={
            req.filled_form ? (
              <>“{req.filled_form.filename}” received — Student Affairs will verify it.</>
            ) : closed ? (
              'Closed without a filled form.'
            ) : (
              'Fill in the attached document and upload it back here.'
            )
          }
        />
      ) : null}
      <Step
        done={closed}
        current={answered && !closed}
        title="Acknowledged & closed"
        detail={
          closed && req.acknowledged_at
            ? toIST(req.acknowledged_at)
            : answered
              ? 'Review the answer, then acknowledge to close the request.'
              : undefined
        }
      />
    </div>
  );
}

/* ---------------- Cursor-paginated list hook ---------------- */

export interface Paged<T> {
  items: T[];
  loading: boolean;
  error: unknown;
  nextCursor: string | null;
  hasPrev: boolean;
  next: () => void;
  prev: () => void;
  reload: () => void;
}

/**
 * Generic cursor-pagination state. Pass a stable fetcher and a deps array —
 * the list reloads from page one whenever deps change.
 */
export function usePaged<T>(
  fetchPage: (cursor?: string) => Promise<Page<T>>,
  deps: unknown[] = [],
): Paged<T> {
  const [items, setItems] = useState<T[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [hasPrev, setHasPrev] = useState(false);
  const stack = useRef<string[]>([]);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  const load = useCallback(async (cursor?: string) => {
    setLoading(true);
    setError(null);
    try {
      const page = await fetchRef.current(cursor);
      setItems(page.items);
      setNextCursor(page.next_cursor ?? null);
    } catch (e) {
      setError(e);
      setItems([]);
      setNextCursor(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    stack.current = [];
    setHasPrev(false);
    load(undefined);
  }, [load, ...deps]);

  const next = useCallback(() => {
    if (!nextCursor) return;
    stack.current.push(nextCursor);
    setHasPrev(true);
    load(nextCursor);
  }, [nextCursor, load]);

  const prev = useCallback(() => {
    stack.current.pop();
    setHasPrev(stack.current.length > 0);
    load(stack.current[stack.current.length - 1]);
  }, [load]);

  const reload = useCallback(() => {
    stack.current = [];
    setHasPrev(false);
    load(undefined);
  }, [load]);

  return { items, loading, error, nextCursor, hasPrev, next, prev, reload };
}

/* ---------------- Skeletons ---------------- */

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-[76px] animate-pulse rounded-2xl bg-ink/5 dark:bg-white/5"
        />
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-label="Loading">
      <div className="h-8 w-2/3 rounded-xl bg-ink/5 dark:bg-white/5" />
      <div className="h-40 rounded-2xl bg-ink/5 dark:bg-white/5" />
      <div className="h-24 rounded-2xl bg-ink/5 dark:bg-white/5" />
    </div>
  );
}

/* ---------------- Paged list wrapper ---------------- */

export function PagedList<T>({
  paged,
  renderItem,
  empty,
  keyOf,
}: {
  paged: Paged<T>;
  renderItem: (item: T) => ReactNode;
  empty: ReactNode;
  keyOf: (item: T) => string;
}) {
  if (paged.loading) return <ListSkeleton />;
  if (paged.error)
    return (
      <Card className="p-6">
        <div className="text-sm font-semibold text-ink dark:text-white">Couldn't load the list</div>
        <div className="mt-3">
          <PagedError error={paged.error} onRetry={paged.reload} />
        </div>
      </Card>
    );
  if (paged.items.length === 0) return <>{empty}</>;
  return (
    <div>
      <div className="space-y-3">{paged.items.map((it) => <div key={keyOf(it)}>{renderItem(it)}</div>)}</div>
      <Pagination
        nextCursor={paged.nextCursor}
        hasPrev={paged.hasPrev}
        onNext={paged.next}
        onPrev={paged.prev}
      />
    </div>
  );
}

function PagedError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="space-y-3">
      <ApiErrorMessage error={error} />
      <Button variant="secondary" size="sm" onClick={onRetry}>
        <Icon name="arrowR" className="h-4 w-4 rotate-180" /> Retry
      </Button>
    </div>
  );
}

/** Convenience empty state for request lists. */
export function RequestsEmpty({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return <EmptyState icon="fileText" title={title} hint={hint} action={action} />;
}
