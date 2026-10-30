/**
 * DocDesk — document type manager (Student Affairs only).
 * Create / rename / archive / restore / delete types. Archived types
 * stop taking new requests (409 DOC_TYPE_ARCHIVED on submit).
 */
import { useCallback, useEffect, useState } from 'react';
import type { DocType, FoundPostStatus } from '../api/types';
import {
  createDocType,
  deleteDocType,
  listDocTypes,
  updateDocType,
} from '../api/docdesk';
import { ApiErrorMessage } from '../components/ApiErrorMessage';
import { EmptyState } from '../components/EmptyState';
import {
  Badge,
  Button,
  Card,
  Field,
  Icon,
  Input,
  Textarea,
} from '../components/ui';
import { toISTDate } from '../utils/dates';
import { ConfirmModal, Modal } from './shared';

function TypeForm({
  initial,
  onClose,
  onSaved,
}: {
  initial?: DocType;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const valid = name.trim().length >= 3 && name.trim().length <= 80;

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (initial) {
        await updateDocType(initial.doc_type_id, {
          name: name.trim(),
          description: description.trim() || null,
        });
      } else {
        await createDocType(name.trim(), description.trim() || undefined);
      }
      onSaved();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={initial ? 'Edit document type' : 'New document type'}
      subtitle={initial ? initial.doc_type_id : 'Names must be unique — duplicates are rejected.'}
      onClose={onClose}
    >
      <div className="space-y-4">
        <Field label="Name" hint={`${name.trim().length}/80 · minimum 3 characters, unique.`}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Bonafide Certificate"
            maxLength={80}
          />
        </Field>
        <Field label="Description (optional)">
          <Textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is it for, who can request it…"
          />
        </Field>
        <ApiErrorMessage error={error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!valid || busy}>
            {busy ? 'Saving…' : initial ? 'Save changes' : 'Create type'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function DocTypesManager() {
  const [filter, setFilter] = useState<FoundPostStatus>('active');
  const [types, setTypes] = useState<DocType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<DocType | null>(null);
  const [deleting, setDeleting] = useState<DocType | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await listDocTypes({ status: filter, limit: 100 });
      setTypes(page.items);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const flipStatus = async (t: DocType) => {
    setRowBusy(t.doc_type_id);
    setRowError(null);
    try {
      await updateDocType(t.doc_type_id, {
        status: t.status === 'active' ? 'archived' : 'active',
      });
      load();
    } catch (e) {
      setRowError(e);
    } finally {
      setRowBusy(null);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setRowBusy(deleting.doc_type_id);
    setRowError(null);
    try {
      await deleteDocType(deleting.doc_type_id);
      setDeleting(null);
      load();
    } catch (e) {
      setRowError(e);
      setDeleting(null);
    } finally {
      setRowBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex gap-2">
          {(['active', 'archived'] as FoundPostStatus[]).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={filter === s ? 'primary' : 'secondary'}
              onClick={() => setFilter(s)}
            >
              {s === 'active' ? 'Active' : 'Archived'}
            </Button>
          ))}
        </div>
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Icon name="plus" className="h-4 w-4" /> New document type
        </Button>
      </Card>

      <ApiErrorMessage error={rowError} />

      {loading ? (
        <div className="space-y-3" aria-label="Loading">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-desk-ink/5 dark:bg-white/5" />
          ))}
        </div>
      ) : error ? (
        <Card className="p-6">
          <ApiErrorMessage error={error} />
          <div className="mt-3">
            <Button variant="secondary" size="sm" onClick={load}>
              Retry
            </Button>
          </div>
        </Card>
      ) : types.length === 0 ? (
        <EmptyState
          icon="fileText"
          title={filter === 'active' ? 'No document types yet' : 'Nothing archived'}
          hint={
            filter === 'active'
              ? 'Create the first one — Bonafide Certificate, Transcript, Scholarship Form…'
              : 'Archived types appear here.'
          }
          action={
            filter === 'active' ? (
              <Button onClick={() => setFormOpen(true)}>
                <Icon name="plus" className="h-4 w-4" /> Create document type
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {types.map((t) => (
            <Card key={t.doc_type_id} className="flex items-start justify-between gap-4 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-[17px] font-semibold tracking-tight text-desk-ink dark:text-white">
                    {t.name}
                  </span>
                  <Badge tone={t.status === 'active' ? 'ivy' : 'slate'}>
                    {t.status === 'active' ? 'Active' : 'Archived'}
                  </Badge>
                </div>
                {t.description ? (
                  <p className="mt-1 text-sm text-desk-ink/60 dark:text-stone-400">{t.description}</p>
                ) : null}
                <p className="mt-1.5 text-xs text-desk-ink/40 dark:text-stone-500">
                  {t.doc_type_id} · updated {toISTDate(t.updated_at)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  title="Edit"
                  onClick={() => setEditing(t)}
                  disabled={rowBusy === t.doc_type_id}
                >
                  <Icon name="pencil" className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  title={t.status === 'active' ? 'Archive (stops new requests)' : 'Restore'}
                  onClick={() => flipStatus(t)}
                  disabled={rowBusy === t.doc_type_id}
                >
                  <Icon name={t.status === 'active' ? 'x' : 'check'} className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  title="Delete"
                  onClick={() => setDeleting(t)}
                  disabled={rowBusy === t.doc_type_id}
                >
                  <Icon name="trash" className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {formOpen ? (
        <TypeForm
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            setFilter('active');
            load();
          }}
        />
      ) : null}
      {editing ? (
        <TypeForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      ) : null}
      {deleting ? (
        <ConfirmModal
          title="Delete this document type?"
          body={
            <>
              <span className="font-semibold">“{deleting.name}”</span> will be removed permanently.
              Existing requests keep working, but no new requests can use it.
            </>
          }
          confirmLabel="Delete type"
          danger
          busy={rowBusy === deleting.doc_type_id}
          onCancel={() => setDeleting(null)}
          onConfirm={remove}
        />
      ) : null}
    </div>
  );
}
