from __future__ import annotations

from typing import Final


MODULE_CATALOG: Final[list[dict[str, str]]] = [
    # Core
    {"key": "dashboard", "label": "Dashboard"},
    {"key": "settings", "label": "Ajustes"},
    {"key": "stations", "label": "Estaciones"},
    {"key": "users", "label": "Usuarios"},
    {"key": "profiles", "label": "Perfiles"},
    {"key": "editor", "label": "Editor AC"},
    # Management
    {"key": "drivers", "label": "Pilotos"},
    {"key": "championships", "label": "Campeonatos"},
    {"key": "history", "label": "Historial"},
    {"key": "mods", "label": "Libreria Mods"},
    {"key": "events", "label": "Eventos/Torneos"},
    {"key": "kiosk", "label": "Modo Kiosko"},
    {"key": "bookings", "label": "Reservas Simuladores"},
    {"key": "tables", "label": "Reservas Mesas"},
    {"key": "analytics", "label": "Analitica/Ingresos"},
    {"key": "online_reservations", "label": "Reservas Online"},
    {"key": "lap_comparison", "label": "Comparar Vueltas"},
    # Public views
    {"key": "leaderboard", "label": "Clasificacion en Vivo"},
    {"key": "passport", "label": "Pasaporte Piloto"},
    {"key": "live_map", "label": "Mapa en Vivo"},
    {"key": "tv", "label": "Modo TV"},
    {"key": "hall_of_fame", "label": "Salon de la Fama"},
    {"key": "battle", "label": "Modo Batalla"},
    {"key": "tv_remote", "label": "Mando TV"},
    {"key": "tv_spectator", "label": "Espectador TV"},
]

MODULE_KEYS: Final[set[str]] = {item["key"] for item in MODULE_CATALOG}

# Legacy frontend keys mapped to canonical module keys.
PERMISSION_ALIASES: Final[dict[str, str]] = {
    "reservations": "bookings",
    "tv_control": "tv_remote",
}


def list_module_catalog() -> list[dict[str, str]]:
    return [dict(item) for item in MODULE_CATALOG]


def canonicalize_module_key(value: str) -> str:
    cleaned = str(value or "").strip()
    if not cleaned:
        return ""
    return PERMISSION_ALIASES.get(cleaned, cleaned)


def normalize_permission_keys(values: list[str] | None) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for raw_value in values or []:
        key = canonicalize_module_key(raw_value)
        if not key or key in seen:
            continue
        seen.add(key)
        normalized.append(key)
    return normalized


def find_invalid_permission_keys(values: list[str] | None) -> list[str]:
    normalized = normalize_permission_keys(values)
    return [key for key in normalized if key != "*" and key not in MODULE_KEYS]
