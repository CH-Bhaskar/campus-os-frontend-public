// Track E2E specs live next to the track and reuse the shared fixtures.
import { expect, test } from '../../../../e2e/fixtures'

test.describe('example track', () => {
  test('is reachable from the home grid and the header nav', async ({ signedInPage: page, shell }) => {
    await shell.trackCard('example').click()
    await expect(page).toHaveURL('/tracks/example')
    await expect(shell.trackNav().getByRole('link', { name: 'Example' })).toHaveAttribute('aria-current', 'page')
  })

  test('adds and deletes a note', async ({ signedInPage: page }) => {
    await page.goto('/tracks/example')
    await page.getByTestId('example-note-input').fill('Finish the demo')
    await page.getByTestId('example-note-submit').click()

    const note = page.getByTestId('example-note').filter({ hasText: 'Finish the demo' })
    await expect(note).toBeVisible()

    await note.getByRole('button', { name: /delete/i }).click()
    await expect(note).toHaveCount(0)
  })
})
