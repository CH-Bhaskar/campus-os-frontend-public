import { describe, expect, it } from 'vitest'
import { safeNext } from '../safeNext'
import { validateLogin } from '../validation'

describe('validateLogin', () => {
  it('requires a valid email and an OTP', () => {
    expect(validateLogin({ email: '', otp: '' })).toEqual({
      email: 'Email is required.',
      otp: 'OTP is required.',
    })
    expect(validateLogin({ email: 'nope', otp: '123456' })).toEqual({ email: 'Enter a valid email address.' })
    expect(validateLogin({ email: 'a@b.co', otp: '123456' })).toEqual({})
  })

  it('accepts only 4 to 8 digit OTPs', () => {
    expect(validateLogin({ email: 'a@b.co', otp: '12a456' }).otp).toBe('OTP must be 4 to 8 digits.')
    expect(validateLogin({ email: 'a@b.co', otp: '123' }).otp).toBe('OTP must be 4 to 8 digits.')
  })
})

describe('safeNext', () => {
  it.each([
    [null, '/'],
    ['/tracks/example', '/tracks/example'],
    ['//evil.com', '/'],
    ['https://evil.com', '/'],
    ['/\\evil.com', '/'],
  ])('safeNext(%s) → %s', (input, expected) => {
    expect(safeNext(input)).toBe(expected)
  })
})
