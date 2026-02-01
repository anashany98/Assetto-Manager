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
- Set PUBLIC_API_TOKEN / PUBLIC_WS_TOKEN (public kiosk or display access).
- If using push notifications: set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.
- If using license verification: set LICENSE_PUBLIC_KEY_PATH or LICENSE_PUBLIC_KEY.

## 2) Create backend/.env
Copy backend/.env.production.example to backend/.env and set real values.
Example values are listed in the template.

## 3) First-time DB init
Two options (pick ONE):
- Option A (recommended for quick start): set AUTO_SCHEMA=true for first run.
  Start the server once, then set AUTO_SCHEMA=false.
- Option B: run migration scripts if you have a defined migration flow.
  Example: python migrate_db.py (project root)

## 4) Build and run (production)
- Run start_server_prod.bat (foreground, shows logs)
  OR
- Run start_system_prod.bat (minimized backend, builds frontend first)

The production UI is served by the backend:
- http://<server-ip>:8000

## 5) Create first admin
- Call /auth/users/setup with header X-Setup-Token or use the UI workflow.
- After first admin, setup is disabled.

## 6) Agent install (per station)
- Copy the agent build or folder.
- Create agent/config.json from agent/config.example.json.
- Set server_url to the server IP (http://<server-ip>:8000)
- Set agent_token to match backend AGENT_TOKEN.
- Set update_signing_key to match UPDATE_SIGNING_KEY.
- Start the agent and confirm it registers in the dashboard.

## 7) Post-deploy checks
- /health returns {"status":"ok"}
- Dashboard loads at http://<server-ip>:8000
- Station registration works (Agent online)
- Kiosk pairing works (kiosk code)

## 8) Backups
- Run scripts/backup_db.ps1 to create a DB backup.
- Store backups in a safe location and set a retention policy.

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

