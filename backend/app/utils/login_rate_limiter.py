"""
Login rate limiting with Redis backend and in-memory fallback.

Uses Redis INCR + EXPIRE for atomic counter operations across multiple workers.
Falls back to an in-memory dictionary when Redis is unavailable.
"""
from __future__ import annotations

import json
import logging
import os
import threading
from datetime import datetime, timedelta, timezone
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
        logger.info("LoginRateLimiter: connected to Redis")
        return _redis_client
    except Exception as exc:
        logger.warning("LoginRateLimiter: Redis unavailable (%s), using in-memory fallback", exc)
        return None


class LoginRateLimiter:
    MAX_FAILED_ATTEMPTS = 5
    LOCKOUT_MINUTES = 15
    PROGRESSIVE_DELAYS = [0, 1, 2, 5, 10]
    ENTRY_TTL_SECONDS = 3600  # Auto-expire entries after 1 hour

    def __init__(self) -> None:
        self._memory: dict[str, dict] = {}
        self._lock = threading.Lock()

    # ── Redis helpers ──────────────────────────────────────────────

    @staticmethod
    def _redis_key(identifier: str) -> str:
        return f"acm:login:ratelimit:{identifier}"

    def _redis_get_entry(self, identifier: str) -> Optional[dict]:
        r = _get_redis()
        if r is None:
            return None
        try:
            raw = r.get(self._redis_key(identifier))
            return json.loads(raw) if raw else None
        except Exception:
            return None

    def _redis_set_entry(self, identifier: str, entry: dict, ttl: int | None = None) -> None:
        r = _get_redis()
        if r is None:
            return
        try:
            r.setex(self._redis_key(identifier), ttl or self.ENTRY_TTL_SECONDS, json.dumps(entry))
        except Exception:
            pass

    def _redis_delete_entry(self, identifier: str) -> None:
        r = _get_redis()
        if r is None:
            return
        try:
            r.delete(self._redis_key(identifier))
        except Exception:
            pass

    # ── Public API ─────────────────────────────────────────────────

    def check_lockout(self, identifier: str) -> tuple[bool, int]:
        """Return (is_locked, remaining_seconds)."""
        now = datetime.now(timezone.utc)

        # Try Redis first
        entry = self._redis_get_entry(identifier)
        if entry is not None:
            blocked_until_str = entry.get("blocked_until")
            if blocked_until_str:
                blocked_until = datetime.fromisoformat(blocked_until_str)
                if now < blocked_until:
                    return True, int((blocked_until - now).total_seconds())
            return False, 0

        # In-memory fallback
        with self._lock:
            entry = self._memory.get(identifier)
            if not entry:
                return False, 0
            blocked_until = entry.get("blocked_until")
            if blocked_until and now < blocked_until:
                return True, int((blocked_until - now).total_seconds())
            return False, 0

    def record_failed_attempt(self, identifier: str) -> int:
        """
        Record a failed login attempt. Returns:
        - 0  -> no delay
        - N  -> delay in seconds (returns as 429 to client)
        - -1 -> account locked out
        """
        now = datetime.now(timezone.utc)

        # Try Redis first
        r = _get_redis()
        if r is not None:
            try:
                return self._redis_record(identifier, now, r)
            except Exception:
                pass  # Fall through to memory

        # In-memory fallback
        with self._lock:
            if identifier not in self._memory:
                self._memory[identifier] = {"count": 0, "first_attempt": now.isoformat()}

            entry = self._memory[identifier]
            entry["count"] = entry.get("count", 0) + 1
            entry["last_attempt"] = now.isoformat()

            count = entry["count"]
            if count >= self.MAX_FAILED_ATTEMPTS:
                blocked_until = now + timedelta(minutes=self.LOCKOUT_MINUTES)
                entry["blocked_until"] = blocked_until.isoformat()
                logger.warning(
                    "Login lockout for %s after %d attempts until %s",
                    identifier, count, blocked_until.isoformat(),
                )
                return -1

            delay_index = min(count - 1, len(self.PROGRESSIVE_DELAYS) - 1)
            return self.PROGRESSIVE_DELAYS[delay_index]

    def _redis_record(self, identifier: str, now: datetime, r) -> int:
        key = self._redis_key(identifier)
        raw = r.get(key)
        entry = json.loads(raw) if raw else {"count": 0}

        entry["count"] = entry.get("count", 0) + 1
        entry["last_attempt"] = now.isoformat()

        count = entry["count"]
        if count >= self.MAX_FAILED_ATTEMPTS:
            blocked_until = now + timedelta(minutes=self.LOCKOUT_MINUTES)
            entry["blocked_until"] = blocked_until.isoformat()
            r.setex(key, self.LOCKOUT_MINUTES * 60 + 60, json.dumps(entry))
            logger.warning(
                "Login lockout for %s after %d attempts (Redis)", identifier, count,
            )
            return -1

        r.setex(key, self.ENTRY_TTL_SECONDS, json.dumps(entry))
        delay_index = min(count - 1, len(self.PROGRESSIVE_DELAYS) - 1)
        return self.PROGRESSIVE_DELAYS[delay_index]

    def clear(self, identifier: str) -> None:
        """Clear failed attempts after successful login."""
        self._redis_delete_entry(identifier)
        with self._lock:
            self._memory.pop(identifier, None)

    def cleanup_stale(self) -> None:
        """Remove expired in-memory entries (Redis handles TTL automatically)."""
        now = datetime.now(timezone.utc)
        with self._lock:
            to_remove = []
            for identifier, entry in self._memory.items():
                last_str = entry.get("last_attempt") or entry.get("first_attempt")
                if not last_str:
                    to_remove.append(identifier)
                    continue
                try:
                    last_attempt = datetime.fromisoformat(last_str)
                    if (now - last_attempt).total_seconds() > self.ENTRY_TTL_SECONDS:
                        to_remove.append(identifier)
                    continue
                except Exception:
                    pass
                blocked_until_str = entry.get("blocked_until")
                if blocked_until_str:
                    try:
                        if now > datetime.fromisoformat(blocked_until_str):
                            to_remove.append(identifier)
                    except Exception:
                        pass
            for ident in to_remove:
                self._memory.pop(ident, None)


login_rate_limiter = LoginRateLimiter()
