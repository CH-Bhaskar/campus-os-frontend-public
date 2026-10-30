import type { Page } from '@playwright/test'

export class AppShell {
  private readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  readonly themeToggle = () => this.page.getByTestId('theme-toggle')
  readonly signOutButton = () => this.page.getByTestId('sign-out')
  readonly trackNav = () => this.page.getByRole('navigation', { name: 'Tracks' })
  readonly trackCard = (id: string) => this.page.getByTestId(`track-card-${id}`)

  async signOut() {
    await this.signOutButton().click()
  }

  /** The theme currently applied to <html>: 'light' | 'dark' | null (follows the system). */
  async appliedTheme() {
    return this.page.locator('html').getAttribute('data-theme')
  }
}
