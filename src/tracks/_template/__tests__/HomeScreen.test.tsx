import { describe, expect, it } from 'vitest'
import { renderRoute, screen } from '@/test/render'
import track from '../index'

describe('__TRACK_ID__ track', () => {
  it('renders its home screen', async () => {
    renderRoute({ route: '/tracks/__TRACK_ID__', user: true, tracks: [track] })
    expect(await screen.findByRole('heading', { name: '__TRACK_TITLE__' })).toBeInTheDocument()
  })
})
