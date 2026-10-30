import { Button, Card, Stack, Text } from '@/ui'
import type { Note } from '../api/notesApi'

export function NoteItem({ note, onDelete }: { note: Note, onDelete: (id: string) => void }) {
  return (
    <Card as="li" padding={4} data-testid="example-note">
      <Stack direction="row" align="center" justify="space-between" gap={3}>
        <Text>{note.text}</Text>
        <Button variant="ghost" size="sm" onClick={() => onDelete(note.id)} aria-label={`Delete note: ${note.text}`}>
          Delete
        </Button>
      </Stack>
    </Card>
  )
}
