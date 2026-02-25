import { expect, test } from '@playwright/test';

const MOBILE_ROUTES = [
    '/mobile',
    '/reservar',
    '/bookings',
    '/kiosk',
    '/kiosk-modern',
    '/kiosk-racing',
] as const;

test.describe('Responsive Mobile QA', () => {
    test.use({
        viewport: { width: 390, height: 844 },
    });

    for (const route of MOBILE_ROUTES) {
        test(`should render without horizontal overflow on ${route}`, async ({ page }) => {
            const consoleErrors: string[] = [];
            page.on('console', (msg) => {
                if (msg.type() === 'error') {
                    consoleErrors.push(msg.text());
                }
            });

            await page.goto(route, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(1200);

            const body = page.locator('body');
            await expect(body).toBeVisible();

            const metrics = await page.evaluate(() => ({
                innerWidth: window.innerWidth,
                docWidth: document.documentElement.scrollWidth,
                bodyWidth: document.body?.scrollWidth ?? 0,
            }));

            const widestContent = Math.max(metrics.docWidth, metrics.bodyWidth);
            const overflowPx = widestContent - metrics.innerWidth;
            expect.soft(
                overflowPx,
                `Detected horizontal overflow (${overflowPx}px) on ${route}`,
            ).toBeLessThanOrEqual(2);

            expect.soft(
                consoleErrors.length,
                `Console errors on ${route}: ${consoleErrors.join(' | ')}`,
            ).toBe(0);
        });
    }
});
