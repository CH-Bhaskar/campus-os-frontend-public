import type { ReactNode } from 'react'
import type { RouteObject } from 'react-router'

/**
 * What every track exports as the default export of `src/tracks/<id>/index.ts`.
 * The registry discovers tracks automatically; no shared file needs editing.
 */
export interface TrackManifest {
  /** kebab-case and equal to the folder name. Used as the URL segment (/tracks/<id>) and test-id prefix. */
  id: string
  title: string
  description: string
  /** Team that owns the track. */
  team?: string
  /** Short emoji or element shown on the home card. */
  icon?: ReactNode
  /** Label in the header nav; defaults to `title`. */
  navLabel?: string
  /**
   * Routes relative to /tracks/<id>. Use `index: true` for the landing screen and
   * `lazy` so each track is code-split.
   */
  routes: RouteObject[]
}

export function defineTrack(manifest: TrackManifest): TrackManifest {
  return manifest
}
