import type { Page } from '@playwright/test'

export class LoginPage {
  private readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  readonly email = () => this.page.getByLabel('Email')
  readonly otp = () => this.page.getByLabel('OTP', { exact: true })
  readonly submit = () => this.page.getByRole('button', { name: 'Sign in' })
  readonly error = () => this.page.getByTestId('login-error')

  async goto(next?: string) {
    await this.page.goto(next ? `/login?next=${encodeURIComponent(next)}` : '/login')
  }

  async signIn(email: string, otp = '123456') {
    await this.email().fill(email)
    await this.otp().fill(otp)
    await this.submit().click()
  }
}
