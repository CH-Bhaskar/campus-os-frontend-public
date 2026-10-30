import { Card, Stack, Text } from '@/ui'

export function HomeScreen() {
  return (
    <Stack gap={4}>
      <Text as="h1" size="2xl" weight="bold">__TRACK_TITLE__</Text>
      <Card>
        <Text tone="textMuted" data-testid="__TRACK_ID__-placeholder">
          Start building in <code>src/tracks/__TRACK_ID__</code>.
        </Text>
      </Card>
    </Stack>
  )
}
