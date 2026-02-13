import { chromium, request, type FullConfig } from '@playwright/test';

const BACKEND_URL = process.env.PW_BACKEND_URL || 'http://127.0.0.1:18100';
const USERNAME = process.env.E2E_USERNAME || 'e2e_admin';
const PASSWORD = process.env.E2E_PASSWORD || 'e2e_admin123';

const E2E_CHAMPIONSHIP_NAME = 'E2E Championship';
const E2E_EVENT_NAME = 'E2E Monza Event';
const E2E_DRIVER_NAME = 'E2E DRIVER';

async function waitForHealthy(api: Awaited<ReturnType<typeof request.newContext>>, timeoutMs: number = 60_000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const res = await api.get('/health');
            if (res.ok()) return;
        } catch {
            // ignore
        }
        await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`Backend not healthy after ${timeoutMs}ms (${BACKEND_URL})`);
}

async function ensureUserAndToken(api: Awaited<ReturnType<typeof request.newContext>>) {
    // Register is dev-only. If user exists, it will fail; that's fine.
    try {
        await api.post('/register', { data: { username: USERNAME, password: PASSWORD } });
    } catch {
        // ignore
    }

    const tokenRes = await api.post('/token', { form: { username: USERNAME, password: PASSWORD } });
    if (!tokenRes.ok()) {
        const body = await tokenRes.text();
        throw new Error(`Failed to login for E2E token (status ${tokenRes.status()}): ${body}`);
    }
    const data = (await tokenRes.json()) as { access_token: string };
    if (!data?.access_token) throw new Error('Token response missing access_token');
    return data.access_token;
}

async function seedTelemetryIfNeeded(api: Awaited<ReturnType<typeof request.newContext>>, token: string) {
    let totalSessions = 0;
    try {
        const statsRes = await api.get('/telemetry/stats');
        if (statsRes.ok()) {
            const stats = await statsRes.json();
            totalSessions = Number(stats?.total_sessions || 0);
        }
    } catch {
        // ignore
    }

    // Ensure enough sessions to exercise pagination/load-more in History.
    if (totalSessions < 60) {
        const seedRes = await api.post('/telemetry/seed?count=300', {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!seedRes.ok()) {
            const body = await seedRes.text();
            throw new Error(`Failed to seed telemetry (status ${seedRes.status()}): ${body}`);
        }
    }
}

async function ensureDeterministicSessions(api: Awaited<ReturnType<typeof request.newContext>>) {
    const targetDates = [
        new Date('2026-02-10T12:00:00Z'),
        new Date('2026-02-09T12:00:00Z'),
    ];

    const existingRes = await api.get('/telemetry/sessions', {
        params: { limit: 100, driver_name: E2E_DRIVER_NAME, track_name: 'monza' },
    });
    const existing = existingRes.ok() ? ((await existingRes.json()) as Array<{ date?: string }>) : [];
    const existingIso = new Set(
        existing
            .map((s) => s.date)
            .filter(Boolean)
            .map((d) => {
                try {
                    return new Date(String(d)).toISOString();
                } catch {
                    return '';
                }
            })
            .filter(Boolean)
    );

    for (let i = 0; i < targetDates.length; i++) {
        const dt = targetDates[i];
        const iso = dt.toISOString();
        if (existingIso.has(iso)) continue;

        const bestLap = 90_000 + i * 250;
        const payload = {
            station_id: 1,
            track_name: 'monza',
            car_model: 'ferrari_sf24',
            driver_name: E2E_DRIVER_NAME,
            session_type: 'practice',
            date: iso,
            best_lap: bestLap,
            laps: [
                {
                    driver_name: E2E_DRIVER_NAME,
                    car_model: 'ferrari_sf24',
                    track_name: 'monza',
                    lap_time: bestLap,
                    sectors: [30_000, 30_000, 30_000],
                    telemetry_data: [
                        { t: 0, s: 200, r: 8000, g: 5, n: 0 },
                        { t: 1000, s: 220, r: 8500, g: 6, n: 0.5 },
                        { t: 2000, s: 210, r: 8300, g: 6, n: 1 },
                    ],
                    is_valid: true,
                    timestamp: iso,
                },
            ],
        };

        const res = await api.post('/telemetry/session', { data: payload });
        if (!res.ok()) {
            const body = await res.text();
            throw new Error(`Failed to create deterministic telemetry session (status ${res.status()}): ${body}`);
        }
    }
}

async function ensureChampionshipAndEvent(api: Awaited<ReturnType<typeof request.newContext>>, token: string) {
    const authHeaders = { Authorization: `Bearer ${token}` };

    // Championship
    const champsRes = await api.get('/championships/', { headers: authHeaders });
    const champs = champsRes.ok() ? ((await champsRes.json()) as Array<{ id: number; name: string }>) : [];
    let champId = champs.find((c) => c?.name === E2E_CHAMPIONSHIP_NAME)?.id;
    if (!champId) {
        const now = new Date();
        const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const createRes = await api.post('/championships/', {
            headers: authHeaders,
            data: {
                name: E2E_CHAMPIONSHIP_NAME,
                description: 'E2E seeded championship',
                start_date: now.toISOString(),
                end_date: end.toISOString(),
                is_active: true,
            },
        });
        if (!createRes.ok()) {
            const body = await createRes.text();
            throw new Error(`Failed to create championship (status ${createRes.status()}): ${body}`);
        }
        const created = (await createRes.json()) as { id: number };
        champId = created.id;
    }

    // Event
    const eventsRes = await api.get('/events/', {
        headers: authHeaders,
        params: { skip: 0, limit: 100, name: 'E2E Monza' },
    });
    const events = eventsRes.ok() ? ((await eventsRes.json()) as Array<{ id: number; name: string }>) : [];
    let eventId = events.find((e) => e?.name === E2E_EVENT_NAME)?.id;
    if (!eventId) {
        const now = new Date();
        const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const createRes = await api.post('/events/', {
            headers: authHeaders,
            data: {
                name: E2E_EVENT_NAME,
                description: 'E2E seeded event (monza)',
                start_date: start.toISOString(),
                end_date: end.toISOString(),
                track_name: 'monza',
                status: 'active',
            },
        });
        if (!createRes.ok()) {
            const body = await createRes.text();
            throw new Error(`Failed to create event (status ${createRes.status()}): ${body}`);
        }
        const created = (await createRes.json()) as { id: number };
        eventId = created.id;
    }

    // Link event -> championship (idempotent).
    await api.post(`/championships/${champId}/events/${eventId}`, { headers: authHeaders });
}

export default async function globalSetup(config: FullConfig) {
    const project = config.projects[0];
    const storageStatePath = project?.use?.storageState;
    const baseURL = (project?.use?.baseURL as string | undefined) || 'http://localhost:3010';
    if (typeof storageStatePath !== 'string') {
        throw new Error('Playwright config must set use.storageState to a file path.');
    }

    const api = await request.newContext({ baseURL: BACKEND_URL });
    await waitForHealthy(api);

    const token = await ensureUserAndToken(api);
    await seedTelemetryIfNeeded(api, token);
    await ensureDeterministicSessions(api);
    await ensureChampionshipAndEvent(api, token);

    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(baseURL);
    await page.evaluate((t) => localStorage.setItem('token', t), token);
    await page.context().storageState({ path: storageStatePath });
    await browser.close();

    await api.dispose();
}
