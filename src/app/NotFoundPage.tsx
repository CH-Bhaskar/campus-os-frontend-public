import { Link } from 'react-router'
import { Stack, Text } from '@/ui'

export function NotFoundPage() {
  return (
    <Stack gap={3} align="center" style={{ padding: 'var(--space-8) var(--space-4)', textAlign: 'center' }}>
      <Text as="h1" size="2xl" weight="bold">Page not found</Text>
      <Text tone="textMuted">The page you were looking for doesn't exist.</Text>
      <Link to="/">Go home</Link>
    </Stack>
  )
}
