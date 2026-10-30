import type { RouteObject } from 'react-router'

// Paths are relative to /tracks/example. `lazy` keeps each track in its own bundle chunk.
export const routes: RouteObject[] = [
  {
    index: true,
    lazy: async () => ({ Component: (await import('./screens/NotesScreen')).NotesScreen }),
  },
]
