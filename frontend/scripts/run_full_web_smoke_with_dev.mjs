import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(SCRIPT_DIR, '..');
const ROOT_DIR = path.resolve(FRONTEND_DIR, '..');

const FRONTEND_PORT = Number(process.env.WEB_DEBUG_FRONTEND_PORT || 14100);
const BACKEND_PORT = Number(process.env.WEB_DEBUG_BACKEND_PORT || 18100);
const FRONTEND_URL = process.env.WEB_DEBUG_BASE_URL || `http://127.0.0.1:${FRONTEND_PORT}`;
const BACKEND_URL = process.env.WEB_DEBUG_API_URL || `http://127.0.0.1:${BACKEND_PORT}`;
const PYTHON_BIN = process.env.WEB_DEBUG_PYTHON || (
  process.platform === 'win32'
    ? (existsSync('C:\\Windows\\py.exe') ? 'C:\\Windows\\py.exe' : 'python')
    : 'python'
);
const PYTHON_LAUNCHER_ARGS = process.platform === 'win32' && PYTHON_BIN.toLowerCase() === 'py' ? ['-3'] : [];

const USE_HOST_DB = String(process.env.WEB_REVIEW_USE_HOST_DB || '').toLowerCase() === 'true';
const DB_URL = USE_HOST_DB
  ? undefined
  : `sqlite:///${path.join(os.tmpdir(), `ac_manager_webreview_${process.pid}.db`).replace(/\\/g, '/')}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForUrl = async (url, timeoutMs = 120000) => {
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

const registerE2EUser = async () => {
  const body = JSON.stringify({ username: 'e2e_admin', password: 'e2e_admin123' });
  try {
    await fetch(`${BACKEND_URL}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
  } catch {
    // idempotent: ignore failures and let login prove availability
  }
};

const run = async () => {
  const baseEnv = sanitizeEnv(process.env);

  const backendEnv = sanitizeEnv({
    ...baseEnv,
    ...(USE_HOST_DB
      ? {}
      : {
          DATABASE_URL: DB_URL,
          ENVIRONMENT: 'development',
          ALLOWED_ORIGINS: FRONTEND_URL,
          AUTO_SCHEMA: 'true',
          REQUIRE_SECRETS: 'false',
        }),
    ENABLE_SCHEDULER: 'false',
    TRUST_PROXY_HEADERS: 'true',
    WS_DEV_REQUIRE_AUTH: 'false',
    UVICORN_WORKERS: '1',
    AGENT_TOKEN: '',
    AGENT_TOKENS: '',
    AGENT_TOKENS_JSON: '',
    CLIENT_TOKENS: '',
    CLIENT_TOKENS_JSON: '',
    PUBLIC_API_TOKEN: '',
    PUBLIC_WS_TOKEN: '',
  });

  const frontendEnv = sanitizeEnv({
    ...baseEnv,
    VITE_API_URL: BACKEND_URL,
  });

  const backend = spawn(
    PYTHON_BIN,
    [...PYTHON_LAUNCHER_ARGS, '-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(BACKEND_PORT)],
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

  const frontend = spawn('cmd.exe', ['/d', '/s', '/c', `npm run dev -- --host 127.0.0.1 --port ${FRONTEND_PORT} --strictPort`], {
    cwd: FRONTEND_DIR,
    env: frontendEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  frontend.stdout.on('data', (chunk) => process.stdout.write(`[vite] ${chunk}`));
  frontend.stderr.on('data', (chunk) => process.stderr.write(`[vite] ${chunk}`));

  try {
    const backendReady = await waitForUrl(`${BACKEND_URL}/health`);
    if (!backendReady) throw new Error(`Backend not ready: ${BACKEND_URL}`);

    const frontendReady = await waitForUrl(`${FRONTEND_URL}/login`);
    if (!frontendReady) throw new Error(`Frontend not ready: ${FRONTEND_URL}`);

    await registerE2EUser();

    const smoke = spawn(process.execPath, ['scripts/full_web_smoke.mjs'], {
      cwd: FRONTEND_DIR,
      env: sanitizeEnv({
        ...baseEnv,
        WEB_DEBUG_BASE_URL: FRONTEND_URL,
        WEB_DEBUG_API_URL: BACKEND_URL,
        WEB_DEBUG_USER: 'e2e_admin',
        WEB_DEBUG_PASSWORD: 'e2e_admin123',
      }),
      stdio: 'inherit',
    });

    const code = await new Promise((resolve) => {
      smoke.on('exit', (exitCode) => resolve(exitCode ?? 1));
      smoke.on('error', () => resolve(1));
    });
    if (code !== 0) throw new Error(`full_web_smoke exited with code ${code}`);
  } finally {
    await killTree(frontend.pid);
    await killTree(backend.pid);
  }
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
