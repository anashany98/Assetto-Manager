import { test, expect } from '@playwright/test';

test.describe('Events Search', () => {
    test('should filter events by name', async ({ page }) => {
        await page.goto('/events');

        const search = page.getByPlaceholder(/buscar por nombre/i);
        await search.fill('E2E Monza');

        await expect(page.getByRole('heading', { name: /E2E Monza Event/i })).toBeVisible();
    });
});

