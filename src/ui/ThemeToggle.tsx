import { useTheme, type ThemeMode } from '../theme'
import { Button } from './Button'

const NEXT: Record<ThemeMode, ThemeMode> = { system: 'light', light: 'dark', dark: 'system' }
const LABEL: Record<ThemeMode, string> = { system: 'System', light: 'Light', dark: 'Dark' }

/** Cycles system → light → dark. */
export function ThemeToggle() {
  const { mode, setMode } = useTheme()
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setMode(NEXT[mode])}
      aria-label={`Theme: ${LABEL[mode]}. Switch to ${LABEL[NEXT[mode]]}`}
      data-testid="theme-toggle"
      data-mode={mode}
    >
      {mode === 'dark' ? '☾' : mode === 'light' ? '☀' : '◐'} {LABEL[mode]}
    </Button>
  )
}
