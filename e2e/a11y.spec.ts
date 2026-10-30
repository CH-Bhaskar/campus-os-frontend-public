import AxeBuilder from '@axe-core/playwright'
import { expect, test } from './fixtures'

// Runs in both light and dark projects, so color contrast is checked for each theme.
test.describe('accessibility', () => {
  for (const path of ['/login']) {
    test(`${path} has no axe violations`, async ({ page }) => {
      await page.goto(path)
      const results = await new AxeBuilder({ page }).analyze()
      expect(results.violations).toEqual([])
    })
  }

  test('home has no axe violations', async ({ signedInPage: page }) => {
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations).toEqual([])
  })
})
