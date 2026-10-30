import { emailError } from '@/features/auth/validation'
import { ROLE_FIELDS, type UserField, type UserRole } from './adminApi'

export type UserValues = Record<UserField, string>

// Same rules as the backend's schemas, so most mistakes are caught before the request.
const USN = /^[A-Za-z0-9]{5,20}$/
const PHONE = /^\+?[0-9]{10,15}$/

function lengthError(label: string, value: string, min: number, max: number) {
  if (!value) return `${label} is required.`
  if (value.length < min || value.length > max) return `${label} must be ${min} to ${max} characters.`
  return undefined
}

function fieldError(field: UserField, raw: string) {
  const value = raw.trim()
  switch (field) {
    case 'name':
      return lengthError('Name', value, 2, 100)
    case 'usn':
      if (!value) return 'USN is required.'
      return USN.test(value) ? undefined : 'USN must be 5 to 20 letters or digits.'
    case 'dept':
      return lengthError('Department', value, 2, 60)
    case 'designation':
      return lengthError('Designation', value, 2, 60)
    case 'email_id':
      return emailError(value)
    case 'phone_number':
      if (!value) return 'Phone number is required.'
      return PHONE.test(value) ? undefined : 'Enter 10 to 15 digits, optionally starting with +.'
  }
}

/** Validates only the fields the chosen role carries. */
export function validateUser(role: UserRole, values: UserValues): Partial<UserValues> {
  const errors: Partial<UserValues> = {}
  for (const field of ROLE_FIELDS[role]) {
    const error = fieldError(field, values[field])
    if (error) errors[field] = error
  }
  return errors
}
