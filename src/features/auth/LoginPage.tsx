import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '@/core/auth'
import { Alert, Button, Stack, Text, TextField } from '@/ui'
import { safeNext } from './safeNext'
import { hasErrors, validateLogin, type FieldErrors, type LoginValues } from './validation'

export function LoginPage() {
  const { user, signIn } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))

  const [values, setValues] = useState<LoginValues>({ email: '', otp: '' })
  const [errors, setErrors] = useState<FieldErrors<LoginValues>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (user && !submitting) return <Navigate to={next} replace />

  const update = (field: keyof LoginValues) => (event: ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [field]: event.target.value }))

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const found = validateLogin(values)
    setErrors(found)
    setFormError(null)
    if (hasErrors(found)) return

    setSubmitting(true)
    try {
      await signIn(values.email, values.otp)
      navigate(next, { replace: true })
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Something went wrong. Try again.')
      setSubmitting(false)
    }
  }

  return (
    <Stack gap={6}>
      <Stack gap={1}>
        <Text as="h1" size="xl" weight="bold">Welcome back</Text>
        <Text tone="textMuted" size="sm">Sign in with your institution email and the OTP from your admin.</Text>
      </Stack>

      <form onSubmit={onSubmit} noValidate aria-label="Sign in">
        <Stack gap={4}>
          {formError && <Alert tone="danger" data-testid="login-error">{formError}</Alert>}
          <TextField
            label="Email"
            type="email"
            autoComplete="username"
            value={values.email}
            onChange={update('email')}
            error={errors.email}
            data-testid="login-email"
          />
          <TextField
            label="OTP"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            value={values.otp}
            onChange={update('otp')}
            error={errors.otp}
            data-testid="login-otp"
          />
          <Button type="submit" fullWidth loading={submitting} data-testid="login-submit">
            Sign in
          </Button>
        </Stack>
      </form>
    </Stack>
  )
}
