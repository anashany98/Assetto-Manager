import os

from slowapi import Limiter
from starlette.requests import Request

def _split_forwarded_for(raw: str) -> str | None:
    # "client, proxy1, proxy2"
    parts = [p.strip() for p in (raw or "").split(",") if p.strip()]
    return parts[0] if parts else None


def get_client_ip(request: Request) -> str:
    """
    Best-effort client IP extraction.

    By default we do NOT trust proxy headers because they can be spoofed.
    Set TRUST_PROXY_HEADERS=true only when the app is behind a trusted reverse proxy.
    """
    trust_proxy = (os.getenv("TRUST_PROXY_HEADERS", "false") or "false").lower() in {"1", "true", "yes"}
    if trust_proxy:
        xff = request.headers.get("x-forwarded-for")
        ip = _split_forwarded_for(xff) if xff else None
        if ip:
            return ip
        xri = (request.headers.get("x-real-ip") or "").strip()
        if xri:
            return xri

    client = getattr(request, "client", None)
    host = getattr(client, "host", None)
    return host or "unknown"


# Shared limiter for the whole app
limiter = Limiter(key_func=get_client_ip)
