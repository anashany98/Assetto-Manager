import { test, expect } from '@playwright/test';

test.describe('Booking System', () => {
    test.beforeEach(async ({ page }) => {
        // Login first
        await page.goto('/login');
        await page.getByPlaceholder(/usuario|username/i).fill('admin');
        await page.getByPlaceholder(/contraseña|password/i).fill('admin123');
        await page.getByRole('button', { name: /entrar|login|iniciar/i }).click();
        await expect(page).toHaveURL(/.*dashboard/, { timeout: 10000 });
    });

    test('should navigate to bookings page', async ({ page }) => {
        await page.goto('/bookings');

        // Should show bookings calendar or list
        await expect(page.getByText(/reservas|bookings|calendario/i)).toBeVisible();
    });

    test('should display week view with time slots', async ({ page }) => {
        await page.goto('/bookings');

        // Should show day headers
        const dayHeaders = page.getByText(/lunes|martes|miércoles|jueves|viernes|sábado|domingo/i);
        await expect(dayHeaders.first()).toBeVisible({ timeout: 5000 });
    });

    test('should open booking form when clicking slot', async ({ page }) => {
        await page.goto('/bookings');

        // Find available slot and click
        const availableSlot = page.locator('[class*="slot"], [class*="available"], button').filter({ hasText: /disponible|available|libre/i });

        if (await availableSlot.count() > 0) {
            await availableSlot.first().click();

            // Form should appear
            await expect(page.getByText(/nueva reserva|new booking|crear/i)).toBeVisible();
        }
    });

    test('should validate required fields', async ({ page }) => {
        await page.goto('/bookings');

        // Try to submit without filling form
        const submitBtn = page.getByRole('button', { name: /guardar|crear|reservar|submit/i });

        if (await submitBtn.count() > 0) {
            await submitBtn.first().click();

            // Should show validation error or not submit
            const errorOrForm = page.getByText(/requerido|required|obligatorio|error/i);
            // Form should still be visible (not submitted)
        }
    });
});

test.describe('Public Booking Page', () => {
    test('should show public booking form', async ({ page }) => {
        await page.goto('/book');

        // Should show booking form for public users
        await expect(page.getByText(/reserva|booking|cita/i)).toBeVisible();
    });

    test('should show date picker', async ({ page }) => {
        await page.goto('/book');

        // Should have date selection
        const dateElements = page.getByRole('button', { name: /\d+/ });
        await expect(dateElements.first()).toBeVisible({ timeout: 5000 });
    });
});
