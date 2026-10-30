import type { RouteObject } from 'react-router'

// Paths are relative to /tracks/__TRACK_ID__.
export const routes: RouteObject[] = [
  {
    index: true,
    lazy: async () => ({ Component: (await import('./screens/HomeScreen')).HomeScreen }),
  },
]
