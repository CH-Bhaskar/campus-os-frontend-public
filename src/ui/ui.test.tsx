import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders, screen } from '@/test/render'
import { Button, PasswordField, TextField } from './index'

describe('Button', () => {
  it('fires onClick and forwards data-testid', async () => {
    const onClick = vi.fn()
    const { user } = renderWithProviders(<Button onClick={onClick} data-testid="btn">Save</Button>)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onClick).toHaveBeenCalledOnce()
    expect(screen.getByTestId('btn')).toBeInTheDocument()
  })

  it('is disabled and busy while loading', () => {
    renderWithProviders(<Button loading>Save</Button>)
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })
})

describe('TextField', () => {
  it('associates the label, hint and error with the input', () => {
    renderWithProviders(<TextField label="Email" hint="Work email" error="Required" />)
    const input = screen.getByLabelText('Email')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Required')
  })

  it('shows the hint when there is no error', () => {
    renderWithProviders(<TextField label="Email" hint="Work email" />)
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription('Work email')
  })
})

describe('PasswordField', () => {
  it('toggles visibility', async () => {
    const { user } = renderWithProviders(<PasswordField label="Password" />)
    const input = screen.getByLabelText('Password')
    expect(input).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(input).toHaveAttribute('type', 'text')
  })
})
