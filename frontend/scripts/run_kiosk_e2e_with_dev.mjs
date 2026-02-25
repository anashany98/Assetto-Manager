import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(SCRIPT_DIR, '..');
const ROOT_DIR = path.resolve(FRONTEND_DIR, '..');

const FRONTEND_PORT = Number(process.env.KIOSK_E2E_FRONTEND_PORT || 14100);
const BACKEND_PORT = Number(process.env.KIOSK_E2E_BACKEND_PORT || 18100);
const DEV_URL = process.env.BASE_URL || `http://127.0.0.1:${FRONTEND_PORT}`;
const API_URL = process.env.API_URL || `http://127.0.0.1:${BACKEND_PORT}`;
const API = new URL(API_URL);
const BACKEND_HOST = API.hostname || '127.0.0.1';
const BACKEND_PORT_STR = String(API.port || String(BACKEND_PORT));
const PYTHON_BIN = process.env.KIOSK_E2E_PYTHON || (
  process.platform === 'win32'
    ? (existsSync('C:\\Windows\\py.exe') ? 'C:\\Windows\\py.exe' : 'python')
    : 'python'
);
const PYTHON_LAUNCHER_ARGS = process.platform === 'win32' && PYTHON_BIN.toLowerCase() === 'py' ? ['-3'] : [];

const DB_URL = process.env.KIOSK_E2E_DATABASE_URL || `sqlite:///${path.join(os.tmpdir(), `ac_manager_kiosk_e2e_${process.pid}.db`).replace(/\\/g, '/')}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForUrl = async (url, timeoutMs = 90000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // retry
    }
    await sleep(1000);
  }
  return false;
};

const killTree = async (pid) => {
  if (!pid) return;
  await new Promise((resolve) => {
    const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    killer.on('exit', () => resolve());
    killer.on('error', () => resolve());
  });
};

const sanitizeEnv = (base) => {
  const out = {};
  for (const [key, value] of Object.entries(base)) {
    if (!key || key.startsWith('=')) continue;
    if (typeof value === 'undefined') continue;
    out[key] = String(value);
  }
  return out;
};

const run = async () => {
  const baseEnv = sanitizeEnv(process.env);
  const backendEnv = sanitizeEnv({
    ...baseEnv,
    DATABASE_URL: DB_URL,
    ENVIRONMENT: 'development',
    AUTO_SCHEMA: 'true',
    ENABLE_SCHEDULER: 'false',
    TRUST_PROXY_HEADERS: 'true',
    UVICORN_WORKERS: '1',
    AGENT_TOKEN: '',
    AGENT_TOKENS: '',
    AGENT_TOKENS_JSON: '',
    CLIENT_TOKENS: '',
    CLIENT_TOKENS_JSON: '',
    PUBLIC_API_TOKEN: '',
    PUBLIC_WS_TOKEN: '',
  });

  const devEnv = sanitizeEnv({
    ...baseEnv,
    VITE_API_URL: API_URL,
  });

  const backend = spawn(
    PYTHON_BIN,
    [...PYTHON_LAUNCHER_ARGS, '-m', 'uvicorn', 'app.main:app', '--host', BACKEND_HOST, '--port', BACKEND_PORT_STR],
    {
      cwd: path.join(ROOT_DIR, 'backend'),
      env: backendEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  backend.on('error', (err) => {
    console.error(`[backend] failed to launch ${PYTHON_BIN}: ${err?.message || err}`);
  });

  backend.stdout.on('data', (chunk) => process.stdout.write(`[backend] ${chunk}`));
  backend.stderr.on('data', (chunk) => process.stderr.write(`[backend] ${chunk}`));

  const dev = spawn('cmd.exe', ['/d', '/s', '/c', `npm run dev -- --host 127.0.0.1 --port ${FRONTEND_PORT} --strictPort`], {
    cwd: FRONTEND_DIR,
    env: devEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  dev.stdout.on('data', (chunk) => process.stdout.write(`[vite] ${chunk}`));
  dev.stderr.on('data', (chunk) => process.stderr.write(`[vite] ${chunk}`));

  try {
    const backendReady = await waitForUrl(`${API_URL}/health`, 120000);
    if (!backendReady) {
      throw new Error(`Backend did not become ready on ${API_URL}`);
    }

    const ready = await waitForUrl(DEV_URL, 120000);
    if (!ready) {
      throw new Error(`Vite did not become ready on ${DEV_URL}`);
    }

    const check = spawn(process.execPath, ['scripts/kiosk_e2e_check.mjs'], {
      cwd: FRONTEND_DIR,
      env: sanitizeEnv({
        ...baseEnv,
        BASE_URL: DEV_URL,
        API_URL,
      }),
      stdio: 'inherit',
    });

    const exitCode = await new Promise((resolve) => {
      check.on('exit', (code) => resolve(code ?? 1));
      check.on('error', () => resolve(1));
    });

    if (exitCode !== 0) {
      throw new Error(`kiosk_e2e_check exited with code ${exitCode}`);
    }
  } finally {
    await killTree(dev.pid);
    await killTree(backend.pid);
  }
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
