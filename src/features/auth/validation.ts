export type FieldErrors<T> = Partial<Record<keyof T, string>>

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const OTP = /^[0-9]{4,8}$/

export interface LoginValues {
  email: string
  otp: string
}

export function emailError(email: string) {
  if (!email.trim()) return 'Email is required.'
  if (!EMAIL.test(email.trim())) return 'Enter a valid email address.'
  return undefined
}

export function validateLogin(values: LoginValues): FieldErrors<LoginValues> {
  const errors: FieldErrors<LoginValues> = {}
  const email = emailError(values.email)
  if (email) errors.email = email
  if (!values.otp.trim()) errors.otp = 'OTP is required.'
  else if (!OTP.test(values.otp.trim())) errors.otp = 'OTP must be 4 to 8 digits.'
  return errors
}

export function hasErrors(errors: object) {
  return Object.keys(errors).length > 0
}
