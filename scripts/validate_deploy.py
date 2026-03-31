"""
validate_deploy.py - Script de verificación pre-despliegue para LAN.

Uso:
    python scripts/validate_deploy.py http://192.168.1.10:8000
    python scripts/validate_deploy.py http://192.168.1.10:8000 --agents 4
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.request
import urllib.error
import os
from pathlib import Path


# Colores para terminal
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
RESET = "\033[0m"
BOLD = "\033[1m"


def ok(msg: str) -> None:
    print(f"  {GREEN}PASS{RESET}  {msg}")


def fail(msg: str) -> None:
    print(f"  {RED}FAIL{RESET}  {msg}")


def warn(msg: str) -> None:
    print(f"  {YELLOW}WARN{RESET}  {msg}")


def get_json(base_url: str, path: str, timeout: int = 5) -> tuple[int, dict | None]:
    """GET request returning (status_code, json_body | None)."""
    url = f"{base_url.rstrip('/')}{path}"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, None
    except Exception:
        return 0, None


def main() -> int:
    parser = argparse.ArgumentParser(description="Validar despliegue AC Manager")
    parser.add_argument("base_url", help="URL base del servidor (http://IP:PORT)")
    parser.add_argument("--agents", type=int, default=4, help="Número de agents esperados (default: 4)")
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")
    expected_agents = args.agents

    print(f"\n{BOLD}AC Manager - Validación de despliegue{RESET}")
    print(f"Servidor: {base_url}")
    print(f"Agents esperados: {expected_agents}\n")

    errors = 0

    # ── 1. Health checks ──────────────────────────────────────────
    print(f"{BOLD}[1/6] Health checks{RESET}")

    status, data = get_json(base_url, "/health/live")
    if status == 200 and data and data.get("status") == "ok":
        ok("Backend vivo (/health/live)")
    else:
        fail(f"Backend no responde (status={status})")
        errors += 1

    status, data = get_json(base_url, "/health")
    if status == 200 and data:
        db_status = data.get("checks", {}).get("db")
        if db_status == "ok":
            ok("Base de datos conectada")
        else:
            fail(f"Base de datos: {db_status}")
            errors += 1
    else:
        fail("Health check no disponible")
        errors += 1

    # ── 2. PostgreSQL (no SQLite) ─────────────────────────────────
    print(f"\n{BOLD}[2/6] Base de datos{RESET}")

    # Intentar obtener info del sistema
    status, data = get_json(base_url, "/health/system")
    if status == 200:
        ok("Endpoint /health/system accesible")
    elif status == 401 or status == 403:
        warn("/health/system requiere autenticación (normal en producción)")
    else:
        warn(f"/health/system retornó status {status}")

    # ── 3. Autenticación ──────────────────────────────────────────
    print(f"\n{BOLD}[3/6] Autenticación{RESET}")

    # Test login
    try:
        import urllib.parse
        form_data = urllib.parse.urlencode({"username": "nonexistent", "password": "wrong"}).encode()
        req = urllib.request.Request(
            f"{base_url}/auth/token",
            data=form_data,
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            pass
        warn("Login con credenciales incorrectas no retornó error")
    except urllib.error.HTTPError as e:
        if e.code in (401, 429):
            ok(f"Login rechaza credenciales inválidas (status {e.code})")
        else:
            warn(f"Login retornó status inesperado: {e.code}")
    except Exception:
        warn("No se pudo conectar al endpoint de login")

    # ── 4. CORS ───────────────────────────────────────────────────
    print(f"\n{BOLD}[4/6] CORS{RESET}")

    try:
        req = urllib.request.Request(
            f"{base_url}/health/live",
            method="OPTIONS",
        )
        req.add_header("Origin", "http://192.168.1.100:3000")
        req.add_header("Access-Control-Request-Method", "GET")
        with urllib.request.urlopen(req, timeout=5) as resp:
            cors_header = resp.headers.get("Access-Control-Allow-Origin", "")
            if cors_header:
                ok(f"CORS configurado: {cors_header}")
            else:
                warn("CORS header no encontrado (puede ser normal si nginx maneja CORS)")
    except urllib.error.HTTPError as e:
        # OPTIONS might return 200 or 204
        warn(f"CORS preflight status: {e.code}")
    except Exception:
        warn("No se pudo verificar CORS")

    # ── 5. Agents ─────────────────────────────────────────────────
    print(f"\n{BOLD}[5/6] Agents / Estaciones{RESET}")

    status, data = get_json(base_url, "/stations/")
    if status == 200 and isinstance(data, list):
        online = sum(1 for s in data if s.get("is_online"))
        ok(f"Estaciones: {len(data)} registradas, {online} online")
        if online < expected_agents:
            warn(f"Esperaban {expected_agents} agents online, hay {online}")
    elif status in (401, 403):
        warn("Estaciones requieren autenticación - verificar manualmente en el dashboard")
    else:
        warn(f"No se pudo obtener lista de estaciones (status={status})")

    # ── 6. Variables de entorno ───────────────────────────────────
    print(f"\n{BOLD}[6/6] Variables de entorno (.env){RESET}")

    env_path = Path(__file__).resolve().parents[1] / "backend" / ".env"
    if env_path.exists():
        ok(f".env encontrado: {env_path}")
        with open(env_path, "r", encoding="utf-8") as f:
            env_content = f.read()

        # Check DATABASE_URL
        if "postgresql://" in env_content:
            ok("DATABASE_URL apunta a PostgreSQL")
        elif "sqlite://" in env_content:
            fail("DATABASE_URL apunta a SQLite (no usar en producción)")
            errors += 1
        else:
            warn("DATABASE_URL no encontrada en .env")

        # Check claves no son placeholders
        for key in ["SECRET_KEY", "SETUP_TOKEN", "AGENT_TOKEN"]:
            lines = [l for l in env_content.splitlines() if l.startswith(f"{key}=")]
            if lines:
                value = lines[0].split("=", 1)[1].strip()
                if value in ("change-me", "", "test", "dev"):
                    fail(f"{key} tiene valor placeholder: '{value}'")
                    errors += 1
                elif len(value) < 16:
                    warn(f"{key} parece corto ({len(value)} chars)")
                else:
                    ok(f"{key} configurado ({len(value)} chars)")
            else:
                warn(f"{key} no encontrada en .env")
    else:
        fail(f".env no encontrado: {env_path}")
        errors += 1

    # ── Resultado ─────────────────────────────────────────────────
    print(f"\n{'=' * 50}")
    if errors == 0:
        print(f"{GREEN}{BOLD}RESULTADO: TODO OK - Listo para desplegar{RESET}\n")
        return 0
    else:
        print(f"{RED}{BOLD}RESULTADO: {errors} error(es) encontrado(s){RESET}\n")
        return 1


if __name__ == "__main__":
    sys.exit(main())
