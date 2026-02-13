from __future__ import annotations

from threading import Lock
from time import time
from typing import Any, Optional


class TTLCache:
    def __init__(self, ttl_seconds: int, maxsize: int = 512) -> None:
        self.ttl_seconds = max(0, int(ttl_seconds))
        self.maxsize = max(1, int(maxsize))
        self._lock = Lock()
        self._store: dict[str, tuple[float, Any]] = {}

    def get(self, key: str) -> Optional[Any]:
        if self.ttl_seconds <= 0:
            return None
        now = time()
        with self._lock:
            item = self._store.get(key)
            if not item:
                return None
            expires_at, value = item
            if expires_at <= now:
                self._store.pop(key, None)
                return None
            return value

    def set(self, key: str, value: Any) -> None:
        if self.ttl_seconds <= 0:
            return
        now = time()
        with self._lock:
            if len(self._store) >= self.maxsize:
                self._store.clear()
            self._store[key] = (now + self.ttl_seconds, value)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()
