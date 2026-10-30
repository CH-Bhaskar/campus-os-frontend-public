import type { ReactNode } from 'react'
import { AuthProvider, type User } from '@/core/auth'
import { ThemeProvider, type ThemeMode } from '@/theme'

export interface ProvidersProps {
  children: ReactNode
  /** Test hooks: start signed in/out or in a fixed theme without touching storage. */
  initialUser?: User | null
  initialTheme?: ThemeMode
}

export function Providers({ children, initialUser, initialTheme }: ProvidersProps) {
  return (
    <ThemeProvider initialMode={initialTheme}>
      <AuthProvider initialUser={initialUser}>{children}</AuthProvider>
    </ThemeProvider>
  )
}
