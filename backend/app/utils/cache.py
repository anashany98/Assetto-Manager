import os
import json
import logging
from typing import Any, Optional
from functools import wraps

logger = logging.getLogger("api.cache")

_redis_client: Optional[Any] = None
_redis_url = os.getenv("REDIS_URL", "").strip()


def _get_redis():
    global _redis_client
    if _redis_client is not None:
        return _redis_client
    
    if not _redis_url:
        logger.debug("REDIS_URL not set, using in-memory cache")
        return None
    
    try:
        import redis.asyncio as redis_async
        _redis_client = redis_async.from_url(_redis_url, decode_responses=True, socket_connect_timeout=2)
        logger.info("Redis cache connected")
        return _redis_client
    except Exception as e:
        logger.warning(f"Failed to connect to Redis: {e}, using in-memory cache")
        return None


class Cache:
    """Simple cache with Redis backend and in-memory fallback."""
    
    def __init__(self, prefix: str = "acm:", ttl: int = 3600):
        self.prefix = prefix
        self.ttl = ttl
        self._memory: dict[str, tuple[float, Any]] = {}
    
    def _memory_key(self, key: str) -> str:
        return f"{self.prefix}{key}"
    
    async def get(self, key: str) -> Optional[Any]:
        redis = _get_redis()
        if redis:
            try:
                value = await redis.get(self._memory_key(key))
                if value:
                    return json.loads(value)
            except Exception as e:
                logger.warning(f"Redis get failed: {e}")
        
        mem_key = self._memory_key(key)
        if mem_key in self._memory:
            expiry, value = self._memory[mem_key]
            if expiry > 0:
                import time
                if time.time() < expiry:
                    return value
                del self._memory[mem_key]
        return None
    
    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        redis = _get_redis()
        ttl = ttl or self.ttl
        
        if redis:
            try:
                await redis.setex(
                    self._memory_key(key),
                    ttl,
                    json.dumps(value)
                )
                return
            except Exception as e:
                logger.warning(f"Redis set failed: {e}")
        
        import time
        mem_key = self._memory_key(key)
        self._memory[mem_key] = (time.time() + ttl, value)
    
    async def delete(self, key: str) -> None:
        redis = _get_redis()
        if redis:
            try:
                await redis.delete(self._memory_key(key))
            except Exception as e:
                logger.warning(f"Redis delete failed: {e}")
        
        mem_key = self._memory_key(key)
        if mem_key in self._memory:
            del self._memory[mem_key]


content_cache = Cache(prefix="content:", ttl=3600)
