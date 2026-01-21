import { test, expect } from '@playwright/test';

test.describe('Booking System', () => {

    test.beforeEach(async ({ page }) => {
        // Login first
        await page.goto('/admin');
        await page.getByPlaceholder(/usuario|username|admin/i).fill('admin');
        await page.getByPlaceholder(/contraseña|password|••••••••/i).fill('admin123');
        await page.getByRole('button', { name: /sign in|entrar|login/i }).click();
        await expect(page).toHaveURL(/.*admin/);
    });

    test('should navigate to bookings page', async ({ page }) => {
        await page.goto('/bookings');
        await expect(page.getByRole('heading', { name: /reservas/i })).toBeVisible();
    });

    test('should display week view with slots or empty state', async ({ page }) => {
        await page.goto('/bookings');

        // Wait for loader to disappear if it exists using testid
        const loader = page.getByTestId('bookings-loader');
        if (await loader.isVisible()) {
            await expect(loader).toBeHidden({ timeout: 10000 });
        }

        // Month should be visible
        await expect(page.getByText(/[a-z]+ \d{4}/i)).toBeVisible();

        // Days of week (one of them)
        await expect(page.getByText(/lun|mar|mié|jue|vie|sáb|dom/i).first()).toBeVisible();

        // Check for either a slot OR "Sin reservas"
        const slot = page.getByText(/^\d{2}:\d{2}$/);
        const empty = page.getByText(/sin reservas/i);
        await expect(slot.or(empty).first()).toBeVisible();
    });

    test('should open booking form', async ({ page }) => {
        await page.goto('/bookings');
        await expect(page.getByTestId('bookings-loader')).toBeHidden({ timeout: 10000 });

        await page.getByRole('button', { name: /nueva reserva/i }).click();
        await expect(page.getByText(/nueva reserva/i)).toBeVisible();
        await expect(page.getByText(/nombre \*/i)).toBeVisible();
    });
});

test.describe('Public Booking Page', () => {
    test('should show date picker logic', async ({ page }) => {
        await page.goto('/reservar');
        // Check for Main Heading
        await expect(page.getByText(/sistema de reservas/i)).toBeVisible();
        await expect(page.getByText(/elige fecha y hora/i)).toBeVisible();

        // Check for day buttons using testid
        await expect(page.getByTestId('date-scroll')).toBeVisible();

        // And check for a day button inside
        await expect(page.locator('button').getByText(/\d{1,2}/).first()).toBeVisible();
    });
});
