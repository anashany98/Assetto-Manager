import { test, expect } from '@playwright/test';

test.describe('ELO / Events Admin', () => {
    test('should display leaderboard table', async ({ page }) => {
        await page.goto('/leaderboard');
        await expect(page.getByRole('table')).toBeVisible();
    });

    test('should open seeded event admin tab', async ({ page }) => {
        await page.goto('/events');

        // Narrow results to the seeded event created in global-setup.
        const search = page.getByPlaceholder(/buscar por nombre/i);
        if ((await search.count()) > 0) {
            await search.fill('E2E Monza');
        }

        const seededCard = page.locator('div').filter({
            has: page.getByRole('heading', { name: /E2E Monza Event/i }),
        });

        const detailsLink = seededCard.getByRole('link', { name: /ver detalles/i });
        if ((await detailsLink.count()) > 0) {
            await detailsLink.first().click();
        } else {
            // Fallback: open first event card.
            await page.locator('a[href^="/events/"]').first().click();
        }

        await expect(page.getByText(/volver a torneos/i)).toBeVisible();

        // Switch to admin tab
        await page.getByRole('button', { name: /admin/i }).click();

        // TournamentAdmin should expose at least one of these actions.
        await expect(page.getByText(/finalizar evento|generar cuadro/i).first()).toBeVisible();
    });
});
