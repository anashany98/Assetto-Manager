import { test, expect } from '@playwright/test';

test.describe('Leaderboard Page', () => {
    test('should display leaderboard on TV mode', async ({ page }) => {
        await page.goto('/tv/leaderboard');

        const table = page.getByRole('table');
        const emptyState = page.getByText(/sin tiempos registrados|esperando tiempos|waiting/i);

        await expect(table.or(emptyState).first()).toBeVisible({ timeout: 10000 });

        if (await table.first().isVisible()) {
            await expect(page.getByRole('columnheader', { name: /rank|posic/i })).toBeVisible();
            await expect(page.getByRole('columnheader', { name: /piloto|driver/i })).toBeVisible();
            await expect(page.getByRole('columnheader', { name: /tiempo|time/i })).toBeVisible();
            return;
        }

        await expect(emptyState.first()).toBeVisible();
    });

    test('should display track map', async ({ page }) => {
        await page.goto('/leaderboard');

        const mapImage = page.locator('img[alt="Circuit Map"]');
        const mapFallback = page.getByText(/mapa no disponible/i);

        await expect(mapImage.or(mapFallback).first()).toBeVisible({ timeout: 10000 });
    });

    test('should filter by period (Desktop Mode)', async ({ page }) => {
        await page.goto('/leaderboard');

        const todayButton = page.getByRole('button', { name: /hoy/i });
        const historyButton = page.getByRole('button', { name: /hist/i });

        await expect(historyButton).toBeVisible();
        await expect(todayButton).toBeVisible();

        const todayRequest = page.waitForRequest((request) => {
            const url = request.url();
            return url.includes('/telemetry/leaderboard') && url.includes('period=today');
        });

        await todayButton.click();
        await todayRequest;

        await expect(todayButton).toHaveClass(/bg-blue-6/);
    });

    test('should show mobile leaderboard', async ({ page }) => {
        await page.goto('/mobile');
        await expect(page.getByText(/simracing bar/i)).toBeVisible();
    });
});
