import { test, expect } from '@playwright/test';

test.describe('History Page', () => {
    test('should load sessions and paginate with "Cargar más"', async ({ page }) => {
        await page.goto('/history');

        const countEl = page.getByTestId('history-sessions-count');
        await expect(countEl).not.toHaveText('0', { timeout: 15000 });

        const initial = Number.parseInt((await countEl.textContent()) || '0', 10);
        expect(initial).toBeGreaterThan(0);

        await page.getByTestId('history-load-more').click();

        await expect.poll(async () => {
            const txt = await countEl.textContent();
            return Number.parseInt(txt || '0', 10);
        }).toBeGreaterThan(initial);
    });

    test('should filter deterministic driver/track sessions', async ({ page }) => {
        await page.goto('/history');

        await page.getByTestId('history-filter-driver').fill('E2E DRIVER');
        await page.getByTestId('history-filter-track').fill('monza');
        await page.getByTestId('history-apply-filters').click();

        const countEl = page.getByTestId('history-sessions-count');
        await expect.poll(async () => {
            const txt = await countEl.textContent();
            return Number.parseInt(txt || '0', 10);
        }, { timeout: 15000 }).toBe(2);
    });
});

