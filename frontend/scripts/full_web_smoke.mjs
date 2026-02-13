import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.WEB_DEBUG_BASE_URL || 'http://localhost:3010';
const API_URL = process.env.WEB_DEBUG_API_URL || 'http://127.0.0.1:8000';
const USERNAME = process.env.WEB_DEBUG_USER || process.env.E2E_USERNAME || 'e2e_admin';
const PASSWORD = process.env.WEB_DEBUG_PASSWORD || process.env.E2E_PASSWORD || 'e2e_admin123';

const ROUTES = [
  '/admin',
  '/admin/scenarios',
  '/drivers',
  '/events',
  '/championships',
  '/history',
  '/bookings',
  '/reservations',
  '/mods',
  '/online-reservations',
  '/compare',
  '/settings',
  '/profiles',
  '/users',
  '/remote',
  '/leaderboard',
  '/hall-of-fame',
  '/kiosk',
  '/battle',
  '/live-map',
  '/tv',
  '/reservar',
  '/portal',
  '/station-display',
  '/tv/leaderboard',
  '/tv/ads',
  '/tv/spectator',
  '/tv/spectator-fullscreen',
  '/tv/spectator-multi',
  '/mobile',
  '/passport-scanner',
  '/tv-mode',
  '/elimination',
  '/hardware',
  '/analytics',
  '/lock-screen',
];

function isTrackedUrl(url) {
  return url.startsWith(BASE_URL) || url.startsWith(API_URL);
}

function normalizeError(err) {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const consoleIssues = [];
  const networkIssues = [];

  page.on('console', (msg) => {
    const type = msg.type();
    if (type !== 'error') return;
    consoleIssues.push({
      type,
      text: msg.text(),
      url: page.url(),
      timestamp: new Date().toISOString(),
    });
  });

  page.on('response', (res) => {
    const url = res.url();
    if (!isTrackedUrl(url)) return;
    const status = res.status();
    if (status < 400) return;
    networkIssues.push({
      status,
      method: res.request().method(),
      url,
      route: page.url(),
      timestamp: new Date().toISOString(),
    });
  });

  const visited = [];

  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.getByTestId('login-username').fill(USERNAME);
    await page.getByTestId('login-password').fill(PASSWORD);
    await page.getByTestId('login-submit').click();
    await page.waitForTimeout(1200);

    for (const route of ROUTES) {
      const url = `${BASE_URL}${route}`;
      const start = Date.now();
      try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(800);
        const title = await page.title();
        visited.push({
          route,
          finalUrl: page.url(),
          title,
          status: response?.status() ?? null,
          durationMs: Date.now() - start,
        });
      } catch (err) {
        visited.push({
          route,
          finalUrl: page.url(),
          error: normalizeError(err),
          durationMs: Date.now() - start,
        });
      }
    }
  } finally {
    await browser.close();
  }

  const result = {
    meta: {
      baseUrl: BASE_URL,
      apiUrl: API_URL,
      checkedRoutes: ROUTES.length,
      generatedAt: new Date().toISOString(),
    },
    visited,
    consoleIssues,
    networkIssues,
  };

  const outDir = path.resolve('output', 'playwright');
  await fs.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, 'full-web-debug-report.json');
  await fs.writeFile(outFile, JSON.stringify(result, null, 2), 'utf8');
  console.log(`Saved report: ${outFile}`);
  console.log(`Visited routes: ${visited.length}`);
  console.log(`Console errors: ${consoleIssues.length}`);
  console.log(`Network issues (>=400): ${networkIssues.length}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
