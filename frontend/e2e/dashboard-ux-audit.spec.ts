import { expect, test } from '@playwright/test';
import path from 'node:path';

test.describe('Dashboard UX Audit', () => {
    test('desktop snapshot and layout checks', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto('/admin');
        await page.waitForLoadState('networkidle');

        await expect(page.getByRole('heading', { name: /Sesiones en Curso/i })).toBeVisible();

        const overflowX = await page.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth
        );
        expect(overflowX).toBeLessThanOrEqual(2);

        const outFile = path.resolve('output', 'playwright', 'dashboard-ux-desktop.png');
        await page.screenshot({ path: outFile, fullPage: true });
    });

    test('mobile snapshot and layout checks', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('/admin');
        await page.waitForLoadState('networkidle');

        await expect(page.getByRole('heading', { name: /Sesiones en Curso/i })).toBeVisible();

        const overflowX = await page.evaluate(
            () => document.documentElement.scrollWidth - window.innerWidth
        );
        expect(overflowX).toBeLessThanOrEqual(2);

        const outFile = path.resolve('output', 'playwright', 'dashboard-ux-mobile.png');
        await page.screenshot({ path: outFile, fullPage: true });
    });
});

