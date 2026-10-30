import type { TrackManifest } from './types'

type TrackModule = { default: TrackManifest }

const TRACK_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** Turns the glob result into a validated, sorted list. Exported for tests. */
export function buildRegistry(modules: Record<string, TrackModule>): TrackManifest[] {
  const seen = new Set<string>()
  const tracks: TrackManifest[] = []

  for (const [path, mod] of Object.entries(modules)) {
    const folder = path.split('/').at(-2) ?? ''
    if (folder.startsWith('_')) continue

    const manifest = mod.default
    if (!manifest) throw new Error(`${path} must default-export a TrackManifest (use defineTrack).`)
    if (!TRACK_ID.test(manifest.id)) throw new Error(`Track id "${manifest.id}" must be kebab-case.`)
    if (manifest.id !== folder) throw new Error(`Track id "${manifest.id}" must match its folder "${folder}".`)
    if (seen.has(manifest.id)) throw new Error(`Duplicate track id "${manifest.id}".`)

    seen.add(manifest.id)
    tracks.push(manifest)
  }

  return tracks.sort((a, b) => a.title.localeCompare(b.title))
}

export const tracks = buildRegistry(
  // Folders starting with `_` (e.g. _template) are never bundled.
  import.meta.glob<TrackModule>(['../../tracks/*/index.ts', '!../../tracks/_*/index.ts'], { eager: true }),
)
