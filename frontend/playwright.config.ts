import { defineConfig, devices } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';

// Avoid common dev ports (8000 is frequently occupied); keep E2E backend isolated.
const BACKEND_URL = process.env.PW_BACKEND_URL || 'http://127.0.0.1:18100';
const FRONTEND_URL = process.env.PW_FRONTEND_URL || 'http://127.0.0.1:14100';
const STORAGE_STATE_PATH = path.join(os.tmpdir(), 'ac_manager_playwright_storage_state.json');
// Use a fresh DB per run so schema changes don't get stuck behind an old sqlite file.
const E2E_DB_PATH = path.join(os.tmpdir(), `ac_manager_playwright_${process.pid}.db`).replace(/\\/g, '/');
const E2E_DB_URL = `sqlite:///${E2E_DB_PATH}`;

export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',
    // ESM config (package.json has "type": "module"): use a path string instead of require.resolve.
    globalSetup: './e2e/global-setup.ts',

    use: {
        baseURL: FRONTEND_URL,
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        storageState: STORAGE_STATE_PATH,
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],

    webServer: [
        {
            command: 'python -m uvicorn app.main:app --host 127.0.0.1 --port 18100',
            url: `${BACKEND_URL}/health`,
            reuseExistingServer: false,
            cwd: '../backend',
            timeout: 120000,
            env: {
                DATABASE_URL: E2E_DB_URL,
                ENVIRONMENT: 'development',
                ALLOWED_ORIGINS: FRONTEND_URL,
                AUTO_SCHEMA: 'true',
                REQUIRE_SECRETS: 'false',
                ENABLE_SCHEDULER: 'false',
                TRUST_PROXY_HEADERS: 'true',
                WS_DEV_REQUIRE_AUTH: 'false',
                UVICORN_WORKERS: '1',
                // Ensure agent/public token checks stay open in dev E2E regardless of host env vars.
                AGENT_TOKEN: '',
                AGENT_TOKENS: '',
                AGENT_TOKENS_JSON: '',
                CLIENT_TOKENS: '',
                CLIENT_TOKENS_JSON: '',
                PUBLIC_API_TOKEN: '',
                PUBLIC_WS_TOKEN: '',
            },
        },
        {
            command: 'npm run dev -- --host 127.0.0.1 --port 14100 --strictPort',
            url: FRONTEND_URL,
            reuseExistingServer: false,
            timeout: 120000,
            env: {
                VITE_API_URL: BACKEND_URL,
            },
        },
    ],
});
