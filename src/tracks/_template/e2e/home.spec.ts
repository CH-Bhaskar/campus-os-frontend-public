import { expect, test } from '../../../../e2e/fixtures'

test.describe('__TRACK_ID__ track', () => {
  test('opens from the home grid', async ({ signedInPage: page }) => {
    await page.getByTestId('track-card-__TRACK_ID__').click()
    await expect(page).toHaveURL(/\/tracks\/__TRACK_ID__$/)
    await expect(page.getByRole('heading', { name: '__TRACK_TITLE__' })).toBeVisible()
  })
})
