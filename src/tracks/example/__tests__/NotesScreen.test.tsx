import { beforeEach, describe, expect, it } from 'vitest'
import { renderRoute, screen, within } from '@/test/render'
import { __resetNotes } from '../api/notesApi'
import track from '../index'

// Render the track in isolation through the real route table (signed in).
const renderTrack = () => renderRoute({ route: '/tracks/example', user: true, tracks: [track] })

describe('example track: NotesScreen', () => {
  beforeEach(() => __resetNotes([]))

  it('shows the empty state', async () => {
    renderTrack()
    expect(await screen.findByText('No notes yet.')).toBeInTheDocument()
  })

  it('adds and deletes a note', async () => {
    const { user } = renderTrack()
    await user.type(await screen.findByLabelText('New note'), 'Buy milk')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    const list = await screen.findByRole('list', { name: 'Notes' })
    expect(within(list).getByText('Buy milk')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete note: Buy milk' }))
    expect(await screen.findByText('No notes yet.')).toBeInTheDocument()
  })

  it('rejects an empty note', async () => {
    const { user } = renderTrack()
    await user.click(await screen.findByRole('button', { name: 'Add' }))
    expect(screen.getByLabelText('New note')).toHaveAccessibleDescription('Write something first.')
  })
})
