import { test, expect } from '@playwright/test';

const USERNAME = process.env.E2E_USERNAME || 'e2e_admin';
const PASSWORD = process.env.E2E_PASSWORD || 'e2e_admin123';

// Auth tests must run unauthenticated regardless of the default storageState.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Authentication Flow', () => {
    test('should show login page for unauthenticated users', async ({ page }) => {
        await page.goto('/admin');

        // Should redirect to login
        await expect(page).toHaveURL(/.*login/);
        await expect(page.getByRole('heading', { name: /assetto manager/i })).toBeVisible();
    });

    test('should login with valid credentials', async ({ page }) => {
        await page.goto('/admin');
        await expect(page.getByRole('heading', { name: /assetto manager/i })).toBeVisible();

        await page.getByTestId('login-username').fill(USERNAME);
        await page.getByTestId('login-password').fill(PASSWORD);
        await page.getByTestId('login-submit').click();

        await expect(page).toHaveURL(/.*admin/);
    });

    test('should show error for invalid credentials', async ({ page }) => {
        await page.goto('/login');

        await page.getByTestId('login-username').fill('wronguser');
        await page.getByTestId('login-password').fill('wrongpass');
        await page.getByTestId('login-submit').click();

        await expect(page.getByText(/invalid credentials/i)).toBeVisible();
    });

    test('should logout successfully (if logout UI exists)', async ({ page }) => {
        // Login first
        await page.goto('/admin');
        await page.getByTestId('login-username').fill(USERNAME);
        await page.getByTestId('login-password').fill(PASSWORD);
        await page.getByTestId('login-submit').click();
        await expect(page).toHaveURL(/.*admin/);

        const logoutBtn = page.getByRole('button', { name: /salir|logout|cerrar/i });
        if ((await logoutBtn.count()) === 0) return;

        await logoutBtn.first().click();
        await expect(page).toHaveURL(/.*login/);
    });
});

