// Track-local data layer. Swap the in-memory store for fetch() calls when a backend exists.

export interface Note {
  id: string
  text: string
  createdAt: number
}

let store: Note[] = [
  { id: 'welcome', text: 'Welcome to the example track!', createdAt: Date.now() },
]

export async function listNotes(): Promise<Note[]> {
  return [...store].sort((a, b) => b.createdAt - a.createdAt)
}

export async function addNote(text: string): Promise<Note> {
  const note: Note = { id: crypto.randomUUID(), text, createdAt: Date.now() }
  store = [...store, note]
  return note
}

export async function deleteNote(id: string): Promise<void> {
  store = store.filter((note) => note.id !== id)
}

/** Test helper: reset the in-memory store. */
export function __resetNotes(notes: Note[] = []) {
  store = notes
}
