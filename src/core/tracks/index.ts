// Public API for tracks. The registry is deliberately not re-exported here:
// it imports every track, so exporting it would create an import cycle.
export { defineTrack, type TrackManifest } from './types'
