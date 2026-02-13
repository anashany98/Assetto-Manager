import { test, expect } from '@playwright/test';

test.describe('Championship Session Linker', () => {
    test('should open session linker and filter by driver/date', async ({ page }) => {
        await page.goto('/championships');

        await page.getByRole('link', { name: /E2E Championship/i }).click();

        // The session linker lives in the "Calendario" tab.
        await page.getByRole('button', { name: /calendario/i }).click();

        // Open linker modal (one per event).
        await page.locator('[data-testid^="championship-link-sessions-"]').first().click();

        await expect(page.getByTestId('session-linker')).toBeVisible();

        await page.getByTestId('session-linker-search').fill('E2E DRIVER');

        const results = page.getByTestId('session-linker-results');
        const driverRows = results.locator('button', { hasText: 'E2E DRIVER' });
        await expect(driverRows).toHaveCount(2, { timeout: 15000 });

        // Filter by the known seeded date (local date). Should narrow to 1 session.
        await page.getByTestId('session-linker-date').fill('2026-02-10');
        await expect(driverRows).toHaveCount(1, { timeout: 15000 });

        await page.getByTestId('session-linker-close').click();
        await expect(page.getByTestId('session-linker')).toBeHidden();
    });
});
