const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const outDir = path.resolve('output/playwright');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleMsgs = [];
  const pageErrors = [];
  const failed = [];
  page.on('console', msg => {
    if (['error','warning'].includes(msg.type())) {
      consoleMsgs.push(`[${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', err => pageErrors.push(String(err)));
  page.on('requestfailed', req => {
    failed.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText}`);
  });

  const targets = [
    'http://localhost:3010/kiosk',
    'http://localhost:3010/login',
    'http://localhost:3010/admin'
  ];

  for (const url of targets) {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(1500);
    const safe = url.replace(/https?:\/\//, '').replace(/[\/:?&=]+/g, '_');
    await page.screenshot({ path: path.join(outDir, `${safe}.png`), fullPage: true });
  }

  fs.writeFileSync(path.join(outDir, 'ui_debug_report.txt'), [
    '== Console warnings/errors ==',
    ...consoleMsgs,
    '',
    '== Page errors ==',
    ...pageErrors,
    '',
    '== Failed requests ==',
    ...failed,
    ''
  ].join('\n'));

  await browser.close();
})();
