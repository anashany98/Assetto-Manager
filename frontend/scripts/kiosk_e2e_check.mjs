import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3010';
const API_URL = process.env.API_URL || 'http://127.0.0.1:8001';
const OUT_DIR = path.resolve(process.cwd(), '..', 'output', 'playwright', 'kiosk-e2e');

fs.mkdirSync(OUT_DIR, { recursive: true });

const toSafe = (value) => value.replace(/[^a-z0-9_-]+/gi, '_');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getAgentHeaders = () => {
  const token = process.env.KIOSK_E2E_AGENT_TOKEN || process.env.AGENT_TOKEN || '';
  return token ? { 'X-Agent-Token': token } : {};
};

const captureBodyText = async (page) => {
  const body = page.locator('body');
  if ((await body.count()) === 0) return '';
  return body.innerText();
};

const clickScenarioLikeCard = async (page) => {
  return page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('button, div'));
    const target = items.find((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 180 || rect.height < 90) return false;
      if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
      const style = window.getComputedStyle(el);
      const hasPointer = style.cursor === 'pointer';
      if (!hasPointer) return false;
      const text = (el.textContent || '').toLowerCase();
      return /iniciar|enter|min|event|experiencia|selection|practice|lobby|reto|mode/.test(text);
    });
    if (!target) return false;
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return true;
  });
};

const clickFirstLargeButton = async (page) => {
  return page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const target = buttons.find((btn) => {
      const rect = btn.getBoundingClientRect();
      if (rect.width < 120 || rect.height < 60) return false;
      if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
      const text = (btn.textContent || '').trim();
      if (!text) return false;
      if (/desvincular|cambiar|back|volver/i.test(text)) return false;
      return true;
    });
    if (!target) return null;
    const label = (target.textContent || '').trim().slice(0, 80);
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    return label;
  });
};

const clickButtonByText = async (page, re) => {
  const buttons = page.locator('button');
  const count = await buttons.count();
  for (let i = 0; i < count; i += 1) {
    const btn = buttons.nth(i);
    const txt = ((await btn.innerText().catch(() => '')) || '').trim();
    if (!txt) continue;
    if (!re.test(txt)) continue;
    await btn.click({ timeout: 3000 }).catch(() => {});
    return txt;
  }
  return null;
};

const getFirstStationWithCode = async () => {
  const response = await fetch(`${API_URL}/stations/`);
  if (!response.ok) {
    return { error: `stations endpoint returned ${response.status}` };
  }
  const rows = await response.json();

  const pickStationWithCode = (stations) =>
    stations.find((s) => s && s.is_active !== false && typeof s.kiosk_code === 'string' && s.kiosk_code.trim()) ||
    stations.find((s) => s && typeof s.kiosk_code === 'string' && s.kiosk_code.trim());

  if (Array.isArray(rows) && rows.length > 0) {
    const preferred = pickStationWithCode(rows);
    if (preferred) {
      return {
        stationId: Number(preferred.id),
        kioskCode: String(preferred.kiosk_code).trim().toUpperCase(),
        name: preferred.name || `Station ${preferred.id}`,
      };
    }
  }

  // Dev fallback: auto-register one station so kiosk routes can be validated
  // even against a fresh ephemeral DB.
  const stamp = Date.now().toString().slice(-6);
  const macTail = stamp.padStart(6, '0').match(/.{1,2}/g) || ['00', '00', '00'];
  const registerRes = await fetch(`${API_URL}/stations/`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...getAgentHeaders(),
    },
    body: JSON.stringify({
      name: `SIM ${stamp}`,
      ip_address: '127.0.0.1',
      mac_address: `AA:BB:CC:${macTail[0]}:${macTail[1]}:${macTail[2]}`,
      hostname: `kiosk-e2e-${stamp}`,
      ac_path: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\assettocorsa',
      stream_url: null,
    }),
  });

  if (!registerRes.ok) {
    return { error: `no station with kiosk_code and auto-register failed (${registerRes.status})` };
  }

  const created = await registerRes.json();
  if (!created || !created.id || !created.kiosk_code) {
    return { error: 'auto-registered station missing id or kiosk_code' };
  }

  return {
    stationId: Number(created.id),
    kioskCode: String(created.kiosk_code).trim().toUpperCase(),
    name: created.name || `Station ${created.id}`,
  };
};

const routePlan = [
  { key: 'kiosk', path: '/kiosk', includeCode: true, deepFlow: true },
  { key: 'kiosk-modern', path: '/kiosk-modern', includeCode: true, deepFlow: true },
  { key: 'kiosk-racing', path: '/kiosk-racing', includeCode: false, deepFlow: true },
];

const main = async () => {
  const startedAt = new Date().toISOString();
  const station = await getFirstStationWithCode();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  const report = {
    meta: {
      startedAt,
      baseUrl: BASE_URL,
      apiUrl: API_URL,
      station,
    },
    routes: [],
    summary: {
      pass: true,
      issues: [],
    },
  };

  for (const plan of routePlan) {
    const page = await context.newPage();
    const consoleIssues = [];
    const pageErrors = [];
    const requestFailures = [];
    const apiResponses = [];

    page.on('console', (msg) => {
      if (['error', 'warning'].includes(msg.type())) {
        consoleIssues.push(`[${msg.type()}] ${msg.text()}`);
      }
    });
    page.on('pageerror', (err) => pageErrors.push(String(err)));
    page.on('requestfailed', (req) => {
      requestFailures.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText}`);
    });
    page.on('response', (res) => {
      const url = res.url();
      if (!url.startsWith(API_URL)) return;
      apiResponses.push({ url, status: res.status() });
    });

    const query = plan.includeCode && station.kioskCode ? `?kiosk=${encodeURIComponent(station.kioskCode)}` : '';
    const url = `${BASE_URL}${plan.path}${query}`;

    const routeResult = {
      route: plan.path,
      url,
      paired: false,
      hasPairingScreen: false,
      hasRuntimeErrors: false,
      reachedScenarioStep: false,
      reachedContentStep: false,
      progressedContent: false,
      reachedWaitingRoom: false,
      apiCalls: 0,
      api4xx5xx: [],
      consoleIssues: [],
      pageErrors: [],
      requestFailures: [],
      screenshots: [],
    };

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(1500);
    let bodyText = await captureBodyText(page);

    routeResult.hasPairingScreen = /enlazar tablet|enlace rapido por codigo|simuladores activos/i.test(bodyText.toLowerCase());
    routeResult.paired = !routeResult.hasPairingScreen;
    routeResult.reachedScenarioStep = /competicion|experiencia|event selection|eventos|live lobbies|live network/i.test(bodyText.toLowerCase());
    routeResult.reachedWaitingRoom = /sala de espera|waiting room|live session/i.test(bodyText.toLowerCase());

    const firstShot = path.join(OUT_DIR, `${toSafe(plan.key)}_01_initial.png`);
    await page.screenshot({ path: firstShot, fullPage: true });
    routeResult.screenshots.push(firstShot);

    if (plan.deepFlow) {
      await page.mouse.click(720, 450);
      await sleep(1000);

      bodyText = await captureBodyText(page);
      if (!routeResult.reachedScenarioStep) {
        routeResult.reachedScenarioStep = /competicion|experiencia|event selection|eventos|live lobbies|live network/i.test(bodyText.toLowerCase());
      }

      await clickScenarioLikeCard(page);
      await sleep(1300);
      bodyText = await captureBodyText(page);

      routeResult.reachedContentStep =
        /selecciona una marca|selecciona un pais|garage access|vehic|circuito|tracks|cars/i.test(bodyText.toLowerCase());

      if (routeResult.reachedContentStep) {
        const firstChoice = await clickFirstLargeButton(page);
        if (firstChoice) {
          await sleep(900);
          await clickButtonByText(page, /confirmar coche|correr aqu|run|start engine/i);
          await sleep(900);
          const afterContent = await captureBodyText(page);
          routeResult.progressedContent =
            /selecciona un pais|configuracion final|race engineer|transmision|dificultad|assist/i.test(
              afterContent.toLowerCase(),
            );
        }
      }

      const secondShot = path.join(OUT_DIR, `${toSafe(plan.key)}_02_flow.png`);
      await page.screenshot({ path: secondShot, fullPage: true });
      routeResult.screenshots.push(secondShot);
    }

    routeResult.apiCalls = apiResponses.length;
    routeResult.api4xx5xx = apiResponses.filter((r) => r.status >= 400);
    routeResult.consoleIssues = consoleIssues;
    routeResult.pageErrors = pageErrors;
    routeResult.requestFailures = requestFailures;
    routeResult.hasRuntimeErrors =
      routeResult.consoleIssues.length > 0 || routeResult.pageErrors.length > 0 || routeResult.requestFailures.length > 0;

    report.routes.push(routeResult);
    await page.close();
  }

  const issues = [];
  for (const r of report.routes) {
    if (r.hasPairingScreen) issues.push(`${r.route}: still showing manual pairing screen`);
    if (!r.reachedScenarioStep) issues.push(`${r.route}: scenario step not detected`);
    if (r.apiCalls === 0) issues.push(`${r.route}: no API calls to ${API_URL}`);
    if (r.api4xx5xx.length > 0) issues.push(`${r.route}: API returned ${r.api4xx5xx.length} responses with status >= 400`);
    if (r.hasRuntimeErrors) issues.push(`${r.route}: runtime console/page/request errors detected`);
  }

  report.summary.pass = issues.length === 0;
  report.summary.issues = issues;

  const jsonPath = path.join(OUT_DIR, 'kiosk-e2e-report.json');
  const txtPath = path.join(OUT_DIR, 'kiosk-e2e-report.txt');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');

  const lines = [];
  lines.push(`PASS: ${report.summary.pass}`);
  lines.push(`BASE_URL: ${BASE_URL}`);
  lines.push(`API_URL: ${API_URL}`);
  lines.push(`STATION: ${JSON.stringify(station)}`);
  lines.push('');
  for (const r of report.routes) {
    lines.push(`[${r.route}]`);
    lines.push(`paired=${r.paired}`);
    lines.push(`pairingScreen=${r.hasPairingScreen}`);
    lines.push(`scenarioStep=${r.reachedScenarioStep}`);
    lines.push(`contentStep=${r.reachedContentStep}`);
    lines.push(`contentProgressed=${r.progressedContent}`);
    lines.push(`apiCalls=${r.apiCalls}`);
    lines.push(`api4xx5xx=${r.api4xx5xx.length}`);
    lines.push(`runtimeErrors=${r.hasRuntimeErrors}`);
    lines.push(`screenshots=${r.screenshots.join(', ')}`);
    lines.push('');
  }
  if (report.summary.issues.length > 0) {
    lines.push('ISSUES:');
    for (const issue of report.summary.issues) lines.push(`- ${issue}`);
  }
  fs.writeFileSync(txtPath, lines.join('\n'), 'utf-8');

  await browser.close();

  console.log(JSON.stringify({ report: jsonPath, summary: report.summary }, null, 2));
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
