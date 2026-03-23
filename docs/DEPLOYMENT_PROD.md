# Production Deployment Runbook (Windows)

This is a short, practical runbook to deploy this project in production.
It assumes a single Windows server for the operator (backend + frontend) and
separate Windows stations running the Agent.

## 0) Prerequisites
- Python 3.10+ (Add to PATH)
- Node.js LTS
- PostgreSQL (or Supabase) reachable from the server
- Ports: 8000 (backend), 3010 not needed in prod (frontend served by backend)

## 1) Secrets and Rotation (must do)
- Rotate DATABASE_URL credentials.
- Generate a new SECRET_KEY (32+ random bytes).
- Set SETUP_TOKEN (one-time admin creation).
- Set AGENT_TOKEN (Agent auth).
- Set UPDATE_SIGNING_KEY (HMAC for agent update verification).
- Set PUBLIC_API_TOKEN / PUBLIC_WS_TOKEN only for read-only public access.
- Set CLIENT_TOKENS with explicit scopes, for example:
  - `<PUBLIC_API_TOKEN>:public:read`
  - `<PUBLIC_WS_TOKEN>:ws:public`
- Set ALLOW_PUBLIC_TOKEN_QUERY=false (avoid tokens in query params).
- Set ALLOW_WS_TOKEN_QUERY=false (WebSocket auth should use identify frame, not query params).
- Keep ALLOW_INSECURE_QUERY_TOKENS=false.
- Set UVICORN_WORKERS=1 (single worker required for WebSockets/in-memory state).
- If using push notifications: set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.
- If using license verification: set LICENSE_PUBLIC_KEY_PATH or LICENSE_PUBLIC_KEY.
  - Helper: scripts/setup_license_keys.ps1

## 2) Create backend/.env
Copy backend/.env.production.example to backend/.env and set real values.
Example values are listed in the template.
Or run the one-click script:
  scripts/deploy_prod.ps1 -DatabaseUrl "postgresql://..." 
  scripts/deploy_prod.ps1 -UseSqlite
Set REQUIRE_SECRETS=true to enforce strict validation at startup.

## 2b) Create frontend/.env.production (read-only public tokens)
If you use kiosk/public screens in production, the frontend should only ship read-only client tokens.
Create frontend/.env.production with:
  VITE_PUBLIC_API_TOKEN=<PUBLIC_API_TOKEN or a scoped CLIENT_TOKENS token>
  VITE_PUBLIC_WS_TOKEN=<PUBLIC_WS_TOKEN or same as above>
  VITE_USE_WS_QUERY_TOKEN=false
Then rebuild the frontend (the token is baked at build time).
Notes:
- Kiosk control/write flows now rely on the paired `X-Kiosk-Code`, not on a universal public token.
- Public simulator and table reservation forms no longer need client-token write scopes.

## 2c) LAN low-latency streaming profile (recommended for 4 stations)
- Set a central media endpoint and WebRTC fallback in backend/.env:
  - STREAM_BASE_URL=http://<MEDIA_SERVER_IP>:8889/live
  - STREAM_FALLBACK_MODE=webrtc
- In each station agent config, set:
  - stream_url=http://<MEDIA_SERVER_IP>:8889/live/stationX
- OBS encoder profile per station:
  - Resolution: 1280x720 @ 60fps (or 1920x1080 @ 30fps if GPU is tight)
  - Rate control: CBR
  - Bitrate: 4500-6000 kbps
  - Keyframe interval: 1s
  - Encoder preset/tune: low latency

## 3) First-time DB init
Two options (pick ONE):
- Option A (recommended): bootstrap schema explicitly (safe for fresh DBs).
  Run once from repo root:
    python bootstrap_db.py
  Notes:
  - AUTO_SCHEMA is Dev Only (it will NOT run when ENVIRONMENT=production).
  - The Alembic folder currently contains incremental migrations but not a full initial migration.
- Option B: use an existing database that already has the tables (no bootstrap needed).
  If your DB is already live, skip bootstrap and just start the server.

## 4) Build and run (production)
- Run start_server_prod.bat (foreground, shows logs)
  OR
- Run start_system_prod.bat (minimized backend, builds frontend first)
  OR
- Run scripts/deploy_prod.ps1 (one-click)

The production UI is served by the backend:
- http://<server-ip>:8000

## 5) Create first admin
- Call /auth/users/setup with header X-Setup-Token or use the UI workflow.
- After first admin, setup is disabled.

## 6) Agent install (per station)
- Copy the agent build or folder.
- Use the one-click script (recommended):
  scripts/deploy_station.ps1 -ServerUrl "http://<server-ip>:8000" -AgentToken "<AGENT_TOKEN>" -StationName "SIM 1" -ACPath "D:\\SteamLibrary\\steamapps\\common\\assettocorsa" -InstallTask -StartNow
- Or create agent/config.json from agent/config.example.json manually.
- Set server_url to the server IP (http://<server-ip>:8000)
- Set agent_token to match backend AGENT_TOKEN.
- Set update_signing_key to match UPDATE_SIGNING_KEY.
- Start the agent and confirm it registers in the dashboard.

## 7) Post-deploy checks
- /health returns {"status":"ok"}
- /health/live returns {"status":"ok"}
- /health/ready returns {"status":"ok"}
- Dashboard loads at http://<server-ip>:8000
- Station registration works (Agent online)
- Kiosk pairing works (kiosk code)

## 7b) Operational observability/alerts
- Use `GET /system/metrics` (admin) for runtime counters, rolling latency/error SLOs, station summary, WS status, scheduler status, and computed alerts.
- Use `GET /system/alerts` (admin) as a lightweight alert feed for dashboards/monitoring integrations.
- Tune thresholds in `backend/.env`:
  - `ALERT_MIN_REQUESTS`
  - `ALERT_ERROR_RATE_WARN` / `ALERT_ERROR_RATE_CRIT`
  - `ALERT_SERVER_ERROR_RATE_WARN` / `ALERT_SERVER_ERROR_RATE_CRIT`
  - `ALERT_P95_WARN_MS` / `ALERT_P95_CRIT_MS`
  - `ALERT_STATIONS_MIN_TOTAL`
  - `ALERT_STATION_OFFLINE_WARN_RATIO` / `ALERT_STATION_OFFLINE_CRIT_RATIO`
  - `ALERT_EXPECT_SCHEDULER`

## 8) Backups
- Run scripts/backup_db.ps1 to create a DB backup.
- Store backups in a safe location and set a retention policy.
- Optional: scripts/schedule_backup.ps1 to create a daily backup task.

## 9) Windows service (optional)
- Use NSSM or Task Scheduler to run the backend as a Windows service.
- See docs/SERVICE_WINDOWS.md for a ready script.

## 10) Reverse proxy (optional)
- See docs/REVERSE_PROXY.md and docs/Caddyfile.example for HTTPS setup.

## 11) If you rewrote git history (secret purge)
All clones must reset:
  git fetch --all
  git reset --hard origin/master

## 12) Optional hardening
- Put a reverse proxy in front (Nginx/Caddy) and use HTTPS.
- Restrict ALLOWED_ORIGINS to your dashboard domain.
- Disable ENABLE_VMS_INTEGRATION unless needed.

