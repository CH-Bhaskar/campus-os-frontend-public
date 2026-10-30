import { expect, test } from './fixtures'

test.describe('theme', () => {
  test('follows the system color scheme by default', async ({ page, loginPage }, testInfo) => {
    await loginPage.goto()
    const expected = testInfo.project.use.colorScheme === 'dark' ? 'dark' : 'light'
    const scheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)
    expect(scheme).toBe(expected)
  })

  test('toggle choice persists across reloads', async ({ page, loginPage, shell }) => {
    await loginPage.goto()
    await shell.themeToggle().click() // system → light
    await shell.themeToggle().click() // light → dark
    expect(await shell.appliedTheme()).toBe('dark')

    await page.reload()
    expect(await shell.appliedTheme()).toBe('dark')
    await expect(shell.themeToggle()).toHaveAttribute('data-mode', 'dark')
  })
})
