import { test, expect } from '@playwright/test';

test.describe('Leaderboard Page', () => {
    test('should display leaderboard on TV mode', async ({ page }) => {
        await page.goto('/tv/leaderboard');

        // Should show leaderboard table
        await expect(page.getByRole('table')).toBeVisible({ timeout: 10000 });

        // Should have ranking columns
        await expect(page.getByText(/rank|posición/i)).toBeVisible();
        await expect(page.getByText(/piloto|driver/i)).toBeVisible();
        await expect(page.getByText(/tiempo|time/i)).toBeVisible();
    });

    test('should display track map', async ({ page }) => {
        await page.goto('/tv/leaderboard');

        // Track map should be visible (or fallback)
        const trackSection = page.locator('[class*="map"], [class*="track"], img[alt*="track"]');
        await expect(trackSection.first()).toBeVisible({ timeout: 10000 });
    });

    test('should show mobile leaderboard', async ({ page }) => {
        await page.goto('/mobile');

        // Should show mobile-optimized view
        await expect(page.getByText(/ranking|leaderboard|clasificación/i)).toBeVisible();
    });

    test('should filter by period', async ({ page }) => {
        await page.goto('/tv/leaderboard');

        // Find period filters
        const periodButtons = page.getByRole('button', { name: /hoy|semana|mes|histórico/i });

        if (await periodButtons.count() > 0) {
            await periodButtons.first().click();
            // Should update view without errors
            await expect(page.getByRole('table')).toBeVisible();
        }
    });
});
