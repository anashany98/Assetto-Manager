from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Iterable


@dataclass(frozen=True)
class ScopedToken:
    token: str
    scopes: frozenset[str]


def _normalize_scopes(scopes: Iterable[str]) -> frozenset[str]:
    cleaned: list[str] = []
    for s in scopes:
        s = (s or "").strip()
        if not s:
            continue
        cleaned.append(s)
    return frozenset(cleaned) if cleaned else frozenset({"*"})


def parse_scoped_tokens(raw: str | None) -> dict[str, frozenset[str]]:
    """
    Parse scoped API key specs.

    Supported formats:
    - JSON object: {"tokenA": ["scope1", "scope2"], "tokenB": ["*"]}
    - Delimited:   tokenA:scope1,scope2;tokenB:*;tokenC
      (tokenC without scopes implies '*')
    """
    raw = (raw or "").strip()
    if not raw:
        return {}

    if raw.startswith("{"):
        try:
            obj = json.loads(raw)
        except Exception:
            return {}
        if not isinstance(obj, dict):
            return {}
        out: dict[str, frozenset[str]] = {}
        for token, scopes in obj.items():
            if not isinstance(token, str) or not token.strip():
                continue
            if isinstance(scopes, str):
                scope_list = [s.strip() for s in scopes.split(",")]
            elif isinstance(scopes, list):
                scope_list = [str(s).strip() for s in scopes]
            else:
                scope_list = []
            out[token.strip()] = _normalize_scopes(scope_list)
        return out

    out: dict[str, frozenset[str]] = {}
    parts = [p.strip() for p in raw.replace("\n", ";").split(";")]
    for part in parts:
        if not part:
            continue
        token, sep, scope_raw = part.partition(":")
        token = token.strip()
        if not token:
            continue
        if not sep:
            out[token] = frozenset({"*"})
            continue
        scopes = [s.strip() for s in scope_raw.split(",") if s.strip()]
        out[token] = _normalize_scopes(scopes)
    return out


def _token_has_scopes(token_scopes: frozenset[str], required_scopes: frozenset[str]) -> bool:
    if "*" in token_scopes:
        return True
    if not required_scopes:
        return True
    return required_scopes.issubset(token_scopes)


def get_client_tokens() -> dict[str, frozenset[str]]:
    raw = os.getenv("CLIENT_TOKENS_JSON") or os.getenv("CLIENT_TOKENS")
    parsed = parse_scoped_tokens(raw)
    if parsed:
        return parsed

    # Backward-compat: legacy single-token env vars (treated as full access).
    legacy: dict[str, frozenset[str]] = {}
    for key in ("PUBLIC_API_TOKEN", "PUBLIC_WS_TOKEN"):
        tok = (os.getenv(key) or "").strip()
        if tok:
            legacy[tok] = frozenset({"*"})
    return legacy


def get_agent_tokens() -> dict[str, frozenset[str]]:
    raw = os.getenv("AGENT_TOKENS_JSON") or os.getenv("AGENT_TOKENS")
    parsed = parse_scoped_tokens(raw)
    if parsed:
        return parsed

    # Backward-compat: legacy single-token env var (treated as full access).
    tok = (os.getenv("AGENT_TOKEN") or "").strip()
    return {tok: frozenset({"*"})} if tok else {}


def is_client_token_allowed(
    *,
    token: str | None,
    required_scopes: Iterable[str] = (),
    environment: str | None = None,
) -> bool:
    env = (environment or os.getenv("ENVIRONMENT", "development")).lower()
    required = frozenset(s.strip() for s in required_scopes if (s or "").strip())
    tokens = get_client_tokens()

    if env == "production":
        if not tokens:
            return False
        if not token:
            return False
        scopes = tokens.get(token)
        if not scopes:
            return False
        return _token_has_scopes(scopes, required)

    # Dev: open by default unless tokens are configured.
    if not tokens:
        return True
    if not token:
        return False
    scopes = tokens.get(token)
    if not scopes:
        return False
    return _token_has_scopes(scopes, required)


def is_agent_token_allowed(
    *,
    token: str | None,
    required_scopes: Iterable[str] = (),
    environment: str | None = None,
) -> bool:
    env = (environment or os.getenv("ENVIRONMENT", "development")).lower()
    required = frozenset(s.strip() for s in required_scopes if (s or "").strip())
    tokens = get_agent_tokens()

    if env == "production":
        if not tokens:
            return False
        if not token:
            return False
        scopes = tokens.get(token)
        if not scopes:
            return False
        return _token_has_scopes(scopes, required)

    # Dev: open by default unless tokens are configured.
    if not tokens:
        return True
    if not token:
        return False
    scopes = tokens.get(token)
    if not scopes:
        return False
    return _token_has_scopes(scopes, required)

