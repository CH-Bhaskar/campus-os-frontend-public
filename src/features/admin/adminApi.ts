import { apiRequest } from '@/core/api'

export type UserRole = 'student' | 'faculty' | 'office_staff'

export type UserField = 'name' | 'usn' | 'dept' | 'designation' | 'email_id' | 'phone_number'

/** Which fields each role carries; all are required on create (backend ROLE_FIELDS). */
export const ROLE_FIELDS: Record<UserRole, readonly UserField[]> = {
  student: ['name', 'usn', 'dept', 'email_id', 'phone_number'],
  faculty: ['name', 'designation', 'email_id', 'phone_number'],
  office_staff: ['name', 'dept', 'designation', 'email_id', 'phone_number'],
}

export type CreateUserInput = { role: UserRole } & Partial<Record<UserField, string>>

/** What the admin gets back: the new user's profile, including the OTP they log in with. */
export interface CreatedUser {
  role: UserRole
  name: string
  email_id: string
  phone_number: string
  usn?: string
  dept?: string
  designation?: string
  otp: string
}

/** POST /api/v1/admin/users (admin only). */
export function createUser(input: CreateUserInput) {
  return apiRequest<CreatedUser>('/admin/users', { method: 'POST', json: input })
}
