import { useState, type ChangeEvent, type FormEvent } from 'react'
import { fieldErrors } from '@/core/api'
import { hasErrors } from '@/features/auth/validation'
import { Alert, Button, Card, SelectField, Stack, Text, TextField } from '@/ui'
import { createUser, ROLE_FIELDS, type CreatedUser, type UserField, type UserRole } from './adminApi'
import { validateUser, type UserValues } from './validation'

const ROLE_OPTIONS = [
  { value: 'student', label: 'Student' },
  { value: 'faculty', label: 'Faculty' },
  { value: 'office_staff', label: 'Office staff' },
] as const

const ROLE_LABELS: Record<UserRole, string> = { student: 'student', faculty: 'faculty member', office_staff: 'office staff member' }

const FIELD_LABELS: Record<UserField, string> = {
  name: 'Full name',
  usn: 'USN',
  dept: 'Department',
  designation: 'Designation',
  email_id: 'Email',
  phone_number: 'Phone number',
}

// Sample departments from the API guide. Office staff in Student Affairs run DocDesk and
// Campus Maintenance run FixIt, so those names must match exactly.
const DEPT_SUGGESTIONS: Partial<Record<UserRole, string[]>> = {
  student: ['CSE', 'ISE', 'ECE', 'MBA'],
  office_staff: ['Student Affairs', 'Campus Maintenance', 'Accounts', 'Library'],
}

const EMPTY: UserValues = { name: '', usn: '', dept: '', designation: '', email_id: '', phone_number: '' }

export function CreateUserPage() {
  const [role, setRole] = useState<UserRole>('student')
  const [values, setValues] = useState<UserValues>(EMPTY)
  const [errors, setErrors] = useState<Partial<UserValues>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedUser | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const fields = ROLE_FIELDS[role]
  const deptSuggestions = DEPT_SUGGESTIONS[role]

  const update = (field: UserField) => (event: ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [field]: event.target.value }))

  function onRoleChange(event: ChangeEvent<HTMLSelectElement>) {
    setRole(event.target.value as UserRole)
    setErrors({})
    setFormError(null)
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const found = validateUser(role, values)
    setErrors(found)
    setFormError(null)
    setCreated(null)
    if (hasErrors(found)) return

    setSubmitting(true)
    try {
      const body = Object.fromEntries(fields.map((f) => [f, values[f].trim()]))
      setCreated(await createUser({ role, ...body }))
      setValues(EMPTY)
    } catch (error) {
      setErrors(fieldErrors(error))
      setFormError(error instanceof Error ? error.message : 'Something went wrong. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Stack gap={6} style={{ maxWidth: 560 }}>
      <Stack gap={1}>
        <Text as="h1" size="2xl" weight="bold">Admin dashboard</Text>
        <Text tone="textMuted">
          Create a student, faculty or office staff account. Share the OTP shown afterwards so they can sign in.
        </Text>
      </Stack>

      <Card>
        <form onSubmit={onSubmit} noValidate aria-label="Create user">
          <Stack gap={4}>
            <Text as="h2" size="lg" weight="bold">Create a user</Text>
            {created && (
              <Alert tone="success" data-testid="create-user-success">
                Created {ROLE_LABELS[created.role]} {created.name} ({created.email_id}). Login OTP:{' '}
                <strong data-testid="create-user-otp">{created.otp}</strong>
              </Alert>
            )}
            {formError && <Alert tone="danger" data-testid="create-user-error">{formError}</Alert>}
            <SelectField
              label="Role"
              options={ROLE_OPTIONS}
              value={role}
              onChange={onRoleChange}
              data-testid="create-user-role"
            />
            {fields.map((field) => (
              <TextField
                key={field}
                label={FIELD_LABELS[field]}
                type={field === 'email_id' ? 'email' : field === 'phone_number' ? 'tel' : 'text'}
                autoComplete="off"
                list={field === 'dept' && deptSuggestions ? `dept-${role}` : undefined}
                value={values[field]}
                onChange={update(field)}
                error={errors[field]}
                data-testid={`create-user-${field}`}
              />
            ))}
            {deptSuggestions && (
              <datalist id={`dept-${role}`}>
                {deptSuggestions.map((dept) => <option key={dept} value={dept} />)}
              </datalist>
            )}
            <Button type="submit" loading={submitting} data-testid="create-user-submit">
              Create user
            </Button>
          </Stack>
        </form>
      </Card>
    </Stack>
  )
}
