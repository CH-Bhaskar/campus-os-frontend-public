import { defineTrack } from '@/core/tracks'
import { routes } from './routes'

// Reference track: copy its patterns, or scaffold a fresh one with `npm run new-track <id>`.
export default defineTrack({
  id: 'example',
  title: 'Example: Notes',
  description: 'A reference track showing screens, a fake API, unit tests and E2E tests.',
  team: 'Organizers',
  icon: '📝',
  navLabel: 'Example',
  routes,
})
