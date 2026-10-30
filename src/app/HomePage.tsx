import { Link } from 'react-router'
import { useAuth } from '@/core/auth'
import { tracks } from '@/core/tracks/registry'
import { Card, Stack, Text } from '@/ui'
import styles from './HomePage.module.css'

export function HomePage() {
  const { user } = useAuth()

  return (
    <Stack gap={7}>
      <Stack gap={2}>
        <Text as="h1" size="2xl" weight="bold">Hi {user?.name ?? 'there'} 👋</Text>
        <Text tone="textMuted">Pick a track to get started.</Text>
      </Stack>

      {tracks.length === 0 ? (
        <Card>
          <Text tone="textMuted">
            No tracks yet. Run <code>npm run new-track my-feature</code> to create one.
          </Text>
        </Card>
      ) : (
        <ul className={styles.grid} aria-label="Tracks">
          {tracks.map((track) => (
            <li key={track.id}>
              <Link to={`/tracks/${track.id}`} className={styles.link} data-testid={`track-card-${track.id}`}>
                <Card interactive className={styles.card}>
                  <Stack gap={2}>
                    {track.icon && <span className={styles.icon} aria-hidden="true">{track.icon}</span>}
                    <Text as="h2" size="lg" weight="bold">{track.title}</Text>
                    <Text size="sm" tone="textMuted">{track.description}</Text>
                    {track.team && <Text size="xs" tone="primary">Team {track.team}</Text>}
                  </Stack>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Stack>
  )
}
