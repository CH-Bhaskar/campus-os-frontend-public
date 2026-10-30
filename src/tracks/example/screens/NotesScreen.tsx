import { useEffect, useState, type FormEvent } from 'react'
import { Button, Spinner, Stack, Text, TextField } from '@/ui'
import { addNote, deleteNote, listNotes, type Note } from '../api/notesApi'
import { NoteItem } from '../components/NoteItem'

export function NotesScreen() {
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string>()

  useEffect(() => {
    listNotes().then(setNotes)
  }, [])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!draft.trim()) {
      setError('Write something first.')
      return
    }
    setError(undefined)
    await addNote(draft.trim())
    setDraft('')
    setNotes(await listNotes())
  }

  async function onDelete(id: string) {
    await deleteNote(id)
    setNotes(await listNotes())
  }

  return (
    <Stack gap={6}>
      <Stack gap={1}>
        <Text as="h1" size="2xl" weight="bold">Notes</Text>
        <Text tone="textMuted">The example track. Read its source in src/tracks/example.</Text>
      </Stack>

      <form onSubmit={onSubmit} aria-label="Add note">
        <Stack direction="row" gap={2} align="flex-start">
          <div style={{ flex: 1 }}>
            <TextField
              label="New note"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              error={error}
              data-testid="example-note-input"
            />
          </div>
          <Button type="submit" data-testid="example-note-submit" style={{ marginTop: 'calc(var(--text-sm) * 1.5 + var(--space-1))' }}>
            Add
          </Button>
        </Stack>
      </form>

      {notes === null ? (
        <Spinner label="Loading notes" />
      ) : notes.length === 0 ? (
        <Text tone="textMuted">No notes yet.</Text>
      ) : (
        <Stack as="ul" gap={2} aria-label="Notes" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {notes.map((note) => (
            <NoteItem key={note.id} note={note} onDelete={onDelete} />
          ))}
        </Stack>
      )}
    </Stack>
  )
}
