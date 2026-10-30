import { defineTrack } from '@/core/tracks'
import { routes } from './routes'

export default defineTrack({
  id: '__TRACK_ID__',
  title: '__TRACK_TITLE__',
  description: 'Describe what this track does.',
  team: '__TEAM__',
  icon: '✨',
  routes,
})
