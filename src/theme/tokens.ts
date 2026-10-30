// Typed references to the CSS variables in tokens.css, for inline styles and JS.
// Values are `var(--…)` strings, so they follow the active light/dark theme.

export const color = {
  bg: 'var(--color-bg)',
  surface: 'var(--color-surface)',
  surfaceMuted: 'var(--color-surface-muted)',
  text: 'var(--color-text)',
  textMuted: 'var(--color-text-muted)',
  border: 'var(--color-border)',
  primary: 'var(--color-primary)',
  primaryHover: 'var(--color-primary-hover)',
  onPrimary: 'var(--color-on-primary)',
  primarySubtle: 'var(--color-primary-subtle)',
  accent: 'var(--color-accent)',
  danger: 'var(--color-danger)',
  success: 'var(--color-success)',
  focusRing: 'var(--color-focus-ring)',
} as const

export const space = {
  1: 'var(--space-1)',
  2: 'var(--space-2)',
  3: 'var(--space-3)',
  4: 'var(--space-4)',
  5: 'var(--space-5)',
  6: 'var(--space-6)',
  7: 'var(--space-7)',
  8: 'var(--space-8)',
} as const

export const radius = {
  sm: 'var(--radius-sm)',
  md: 'var(--radius-md)',
  lg: 'var(--radius-lg)',
  full: 'var(--radius-full)',
} as const

export const fontSize = {
  xs: 'var(--text-xs)',
  sm: 'var(--text-sm)',
  md: 'var(--text-md)',
  lg: 'var(--text-lg)',
  xl: 'var(--text-xl)',
  '2xl': 'var(--text-2xl)',
} as const

export const shadow = {
  sm: 'var(--shadow-sm)',
  md: 'var(--shadow-md)',
} as const

export type Space = keyof typeof space
export type FontSize = keyof typeof fontSize
export type ColorToken = keyof typeof color
