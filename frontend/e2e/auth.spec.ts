import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
    test('should show login page for unauthenticated users', async ({ page }) => {
        await page.goto('/dashboard');

        // Should redirect to login
        await expect(page).toHaveURL(/.*login/);
        await expect(page.getByRole('heading', { name: /login|iniciar/i })).toBeVisible();
    });

    test('should login with valid credentials', async ({ page }) => {
        await page.goto('/login');

        // Fill login form
        await page.getByPlaceholder(/usuario|username/i).fill('admin');
        await page.getByPlaceholder(/contraseña|password/i).fill('admin123');
        await page.getByRole('button', { name: /entrar|login|iniciar/i }).click();

        // Should redirect to dashboard after login
        await expect(page).toHaveURL(/.*dashboard/, { timeout: 10000 });
    });

    test('should show error for invalid credentials', async ({ page }) => {
        await page.goto('/login');

        await page.getByPlaceholder(/usuario|username/i).fill('wronguser');
        await page.getByPlaceholder(/contraseña|password/i).fill('wrongpass');
        await page.getByRole('button', { name: /entrar|login|iniciar/i }).click();

        // Should show error message
        await expect(page.getByText(/error|incorrecto|invalid/i)).toBeVisible({ timeout: 5000 });
    });

    test('should logout successfully', async ({ page }) => {
        // First login
        await page.goto('/login');
        await page.getByPlaceholder(/usuario|username/i).fill('admin');
        await page.getByPlaceholder(/contraseña|password/i).fill('admin123');
        await page.getByRole('button', { name: /entrar|login|iniciar/i }).click();
        await expect(page).toHaveURL(/.*dashboard/, { timeout: 10000 });

        // Find and click logout button
        await page.getByRole('button', { name: /salir|logout|cerrar/i }).click();

        // Should redirect to login
        await expect(page).toHaveURL(/.*login/);
    });
});
