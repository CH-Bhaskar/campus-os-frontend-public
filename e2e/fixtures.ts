import { test as base, type Page } from '@playwright/test'
import { AppShell } from './pages/AppShell'
import { LoginPage } from './pages/LoginPage'

/** Signing in with this email is rejected by the mocked backend; tests use it for the error state. */
export const FAILING_EMAIL = 'fail@team1.com'

/**
 * Stands in for campus-os-backend's login endpoints so e2e runs without a live server.
 * Any email signs in as a student named after the email, except FAILING_EMAIL.
 */
async function mockLogin(page: Page) {
  await page.route('**/api/v1/auth/login', async (route) => {
    const { email_id } = route.request().postDataJSON() as { email_id: string }
    if (email_id === FAILING_EMAIL) {
      await route.fulfill({ status: 401, json: { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email_id or OTP' } } })
      return
    }
    const local = email_id.split('@')[0] ?? email_id
    const name = local.charAt(0).toUpperCase() + local.slice(1)
    await route.fulfill({
      json: { access_token: 'e2e-token', token_type: 'bearer', expires_in: 3600, profile: { role: 'student', name, email_id } },
    })
  })
}

interface Fixtures {
  loginPage: LoginPage
  shell: AppShell
  /** A page already signed in and sitting on the home screen. */
  signedInPage: Page
}

export const test = base.extend<Fixtures>({
  page: async ({ page }, use) => {
    await mockLogin(page)
    await use(page)
  },
  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  shell: async ({ page }, use) => use(new AppShell(page)),
  signedInPage: async ({ page }, use) => {
    const login = new LoginPage(page)
    await login.goto()
    await login.signIn('student@team1.com')
    await page.waitForURL('/')
    await use(page)
  },
})

export { expect } from '@playwright/test'
