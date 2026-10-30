import { describe, expect, it } from 'vitest'
import { renderWithProviders, screen } from '@/test/render'
import { ThemeToggle } from '@/ui'
import { THEME_STORAGE_KEY } from './ThemeProvider'

describe('ThemeProvider + ThemeToggle', () => {
  it('cycles system → light → dark → system and sets data-theme', async () => {
    const { user } = renderWithProviders(<ThemeToggle />, { theme: 'system' })
    const toggle = screen.getByTestId('theme-toggle')
    const root = document.documentElement

    expect(toggle).toHaveAttribute('data-mode', 'system')
    expect(root).not.toHaveAttribute('data-theme')

    await user.click(toggle)
    expect(toggle).toHaveAttribute('data-mode', 'light')
    expect(root).toHaveAttribute('data-theme', 'light')

    await user.click(toggle)
    expect(toggle).toHaveAttribute('data-mode', 'dark')
    expect(root).toHaveAttribute('data-theme', 'dark')

    await user.click(toggle)
    expect(root).not.toHaveAttribute('data-theme')
  })

  it('persists the chosen mode', async () => {
    const { user } = renderWithProviders(<ThemeToggle />, { theme: 'light' })
    await user.click(screen.getByTestId('theme-toggle'))
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })

  it('has an accessible name describing the next mode', () => {
    renderWithProviders(<ThemeToggle />, { theme: 'light' })
    expect(screen.getByRole('button', { name: /theme: light\. switch to dark/i })).toBeInTheDocument()
  })
})
