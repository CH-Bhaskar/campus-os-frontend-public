import { describe, expect, it } from 'vitest'
import { buildRegistry, tracks } from '../registry'
import type { TrackManifest } from '../types'

const manifest = (id: string): { default: TrackManifest } => ({
  default: { id, title: id, description: '', routes: [] },
})

describe('track registry', () => {
  it('discovers the real tracks and skips _template', () => {
    const ids = tracks.map((t) => t.id)
    expect(ids).toContain('example')
    expect(ids).not.toContain('_template')
  })

  it('rejects ids that do not match the folder', () => {
    expect(() => buildRegistry({ '../../tracks/foo/index.ts': manifest('bar') })).toThrow(/must match its folder/)
  })

  it('rejects non-kebab-case ids', () => {
    expect(() => buildRegistry({ '../../tracks/MyTrack/index.ts': manifest('MyTrack') })).toThrow(/kebab-case/)
  })
})
