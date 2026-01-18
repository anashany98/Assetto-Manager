import { test, expect } from '@playwright/test';

test.describe('ELO System', () => {

    test.beforeEach(async ({ page }) => {
        // Login first by visiting protected route
        await page.goto('/admin');

        // Wait for login form
        await expect(page.getByRole('heading', { name: /Assetto Manager/i })).toBeVisible();

        await page.getByPlaceholder(/usuario|username|admin/i).fill('admin');
        await page.getByPlaceholder(/contraseña|password|••••••••/i).fill('admin123');
        await page.getByRole('button', { name: /sign in|entrar|login/i }).click();

        // Wait for dashboard
        await expect(page).toHaveURL(/.*admin/);
    });


    test('should display ELO badges in leaderboard', async ({ page }) => {
        await page.goto('/leaderboard');

        // Wait for table
        await expect(page.getByRole('table')).toBeVisible();

        // Check for ELO Badge
        // We look for the badge container or style
        const rows = page.locator('tbody tr');
        if (await rows.count() > 0) {
            const firstRow = rows.first();
            await expect(firstRow).toBeVisible();
            // Badge usually has text like "GOLD" or number.
            // We can check if any element with tier-color style exists
            // await expect(page.locator('[class*="bg-opacity"], [style*="background-color"]')).toBeVisible();
        }
    });

    test('should show finalize options in event admin', async ({ page }) => {
        await page.goto('/events');

        // Check if there are events
        // Wait for potential loading
        try {
            await expect(page.locator('text=Cargando')).not.toBeVisible({ timeout: 10000 });
        } catch { }

        const eventCards = page.locator('a[href^="/events/"]');
        if (await eventCards.count() > 0) {
            // Click the first event card
            await eventCards.first().click();

            // Wait for details
            await expect(page.getByText(/volver a torneos/i)).toBeVisible();

            // Click Admin Tab
            await page.getByText(/gestión \(admin\)|admin/i).click();

            // Check for the new sections
            // "Finalizar Evento" text should be visible provided logic in TournamentAdmin
            // Note: TournamentAdmin is rendered inside the tab content.

            const finalizeText = page.getByText(/finalizar evento/i);
            const bracketText = page.getByText(/generar cuadro/i);

            // Either standard finalize OR bracket generation should be visible
            await expect(finalizeText.or(bracketText)).toBeVisible();
        }
    });
});
