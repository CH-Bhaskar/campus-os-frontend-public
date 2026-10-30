import { Outlet } from 'react-router'
import { Card, Stack, Text, ThemeToggle } from '@/ui'
import styles from './AuthLayout.module.css'

export function AuthLayout() {
  return (
    <main className={styles.page}>
      <div className={styles.toggle}>
        <ThemeToggle />
      </div>
      <Stack gap={6} align="stretch" className={styles.column}>
        <Text as="div" size="lg" weight="bold" tone="primary" style={{ textAlign: 'center' }}>
          Campus OS
        </Text>
        <Card padding={7}>
          <Outlet />
        </Card>
      </Stack>
    </main>
  )
}
