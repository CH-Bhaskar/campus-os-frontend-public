import { defineTrack } from '@/core/tracks';
import { routes } from './routes';

export default defineTrack({
  id: 'docdesk',
  title: 'DocDesk',
  description:
    'Request official documents (bonafide, transcripts, forms), track every step, and upload filled forms back. Student Affairs staff get the full console: request queue, bulk turnaround times, document answers, and the request catalog.',
  team: 'Team DocDesk',
  icon: '📄',
  navLabel: 'DocDesk',
  routes,
});
