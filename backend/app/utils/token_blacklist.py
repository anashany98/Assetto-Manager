"""
Token blacklist with Redis backend and in-memory fallback.

Tokens are identified by their `jti` (JWT ID) claim. On logout the jti
is added to the blacklist with a TTL equal to the remaining token lifetime.
"""
from __future__ import annotations

import json
import logging
import os
import threading
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

_REDIS_URL = (os.getenv("REDIS_URL") or "").strip()
_redis_client = None


def _get_redis():
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    if not _REDIS_URL:
        return None
    try:
        import redis
        _redis_client = redis.from_url(_REDIS_URL, decode_responses=True, socket_connect_timeout=2)
        _redis_client.ping()
        logger.info("TokenBlacklist: connected to Redis")
        return _redis_client
    except Exception as exc:
        logger.warning("TokenBlacklist: Redis unavailable (%s), using in-memory fallback", exc)
        return None


class TokenBlacklist:
    REDIS_PREFIX = "acm:auth:blacklist:"

    def __init__(self) -> None:
        self._memory: dict[str, float] = {}  # jti -> expiry timestamp
        self._lock = threading.Lock()

    # ── Public API ─────────────────────────────────────────────────

    def add(self, jti: str, expires_at: float) -> None:
        """Blacklist a token until it naturally expires."""
        r = _get_redis()
        ttl = max(1, int(expires_at - datetime.now(timezone.utc).timestamp()))
        if r:
            try:
                r.setex(f"{self.REDIS_PREFIX}{jti}", ttl, "1")
                logger.debug("Token %s blacklisted (Redis, TTL=%ds)", jti[:8], ttl)
                return
            except Exception:
                pass
        with self._lock:
            self._memory[jti] = expires_at

    def is_blacklisted(self, jti: str) -> bool:
        """Check if a token has been revoked."""
        r = _get_redis()
        if r:
            try:
                return r.exists(f"{self.REDIS_PREFIX}{jti}") > 0
            except Exception:
                pass
        with self._lock:
            exp = self._memory.get(jti)
            if exp and datetime.now(timezone.utc).timestamp() < exp:
                return True
            if exp:
                self._memory.pop(jti, None)
        return False

    def cleanup(self) -> None:
        """Remove expired in-memory entries (Redis handles TTL automatically)."""
        now = datetime.now(timezone.utc).timestamp()
        with self._lock:
            expired = [jti for jti, exp in self._memory.items() if exp < now]
            for jti in expired:
                self._memory.pop(jti, None)


token_blacklist = TokenBlacklist()
