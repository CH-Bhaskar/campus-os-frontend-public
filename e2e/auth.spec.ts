import { expect, FAILING_EMAIL, test } from './fixtures'

test.describe('authentication', () => {
  test('sign in → home → sign out', async ({ page, loginPage, shell }) => {
    await loginPage.goto()
    await loginPage.signIn('asha@team1.com')
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { name: /hi asha/i })).toBeVisible()

    await shell.signOut()
    await expect(page).toHaveURL('/login')
  })

  test('shows an error for rejected credentials', async ({ page, loginPage }) => {
    await loginPage.goto()
    await loginPage.signIn(FAILING_EMAIL)
    await expect(loginPage.error()).toHaveText('Invalid email_id or OTP')
    await expect(page).toHaveURL('/login')
  })

  test('shows validation errors for an empty form', async ({ page, loginPage }) => {
    await loginPage.goto()
    await loginPage.submit().click()
    await expect(page.getByText('Email is required.')).toBeVisible()
    await expect(page.getByText('OTP is required.')).toBeVisible()
  })

  test('deep links survive the login redirect', async ({ page, loginPage }) => {
    await page.goto('/tracks/example')
    await expect(page).toHaveURL('/login?next=%2Ftracks%2Fexample')
    await loginPage.signIn('student@team1.com')
    await expect(page).toHaveURL('/tracks/example')
  })
})
