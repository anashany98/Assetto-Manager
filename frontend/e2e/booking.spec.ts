import { test, expect } from '@playwright/test';

test.describe('Booking System', () => {
    test('should navigate to bookings page', async ({ page }) => {
        await page.goto('/bookings');
        await expect(page.getByRole('heading', { name: /reservas/i })).toBeVisible();
    });

    test('should display week view with slots or empty state', async ({ page }) => {
        await page.goto('/bookings');

        // Wait for auth loader or page loader to disappear.
        const loader = page.getByTestId('bookings-loader');
        if (await loader.isVisible()) {
            await expect(loader).toBeHidden({ timeout: 10000 });
        }

        // Month should be visible
        await expect(page.getByText(/[a-z]+ \d{4}/i)).toBeVisible();

        // Days of week (one of them)
        await expect(page.getByText(/lun|mar|miÃ©|jue|vie|sÃ¡b|dom/i).first()).toBeVisible();

        // Check for either a slot OR "Sin reservas"
        const slot = page.getByText(/^\d{2}:\d{2}$/);
        const empty = page.getByText(/sin reservas/i);
        await expect(slot.or(empty).first()).toBeVisible();
    });

    test('should open booking form', async ({ page }) => {
        await page.goto('/bookings');
        await expect(page.getByTestId('bookings-loader')).toBeHidden({ timeout: 10000 });

        await page.getByRole('button', { name: /nueva reserva/i }).click();
        await expect(page.getByRole('heading', { name: /nueva reserva/i })).toBeVisible();
        await expect(page.getByText(/nombre \*/i)).toBeVisible();
    });
});

test.describe('Public Booking Page', () => {
    test('should show date picker logic', async ({ page }) => {
        await page.goto('/reservar');

        await expect(page.getByText('Sistema de Reservas', { exact: true })).toBeVisible();
        await expect(page.getByText(/elige fecha y hora/i)).toBeVisible();

        await expect(page.getByTestId('date-scroll')).toBeVisible();
        await expect(page.locator('button').getByText(/\d{1,2}/).first()).toBeVisible();
    });
});
