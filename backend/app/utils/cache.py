import os
import json
import logging
import asyncio
from typing import Any, Optional, List, Dict
from datetime import datetime, timezone

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


# In-memory command queue fallback
_command_queue: Dict[int, List[Dict]] = {}
_command_queue_lock = asyncio.Lock() if False else None


class CommandQueue:
    """
    Persistent command queue with Redis backend and in-memory fallback.
    Used for retrying commands when agent is disconnected.
    """
    
    def __init__(self):
        self.prefix = "acm:cmd:queue:"
        self.ttl = int(os.getenv("WS_COMMAND_QUEUE_TTL", "300"))  # 5 minutes default
    
    async def add(self, station_id: int, command: Dict) -> str:
        """Add a command to the queue. Returns command_id."""
        command_id = command.get("command_id") or f"{station_id}_{datetime.now(timezone.utc).timestamp()}"
        command["command_id"] = command_id
        command["station_id"] = station_id
        command["queued_at"] = datetime.now(timezone.utc).isoformat()
        command["retry_count"] = 0
        
        redis = _get_redis()
        if redis:
            try:
                await redis.hset(
                    f"{self.prefix}{station_id}",
                    command_id,
                    json.dumps(command)
                )
                await redis.expire(f"{self.prefix}{station_id}", self.ttl)
                logger.info(f"Command {command_id} added to Redis queue for station {station_id}")
                return command_id
            except Exception as e:
                logger.warning(f"Redis command queue add failed: {e}")
        
        # Fallback to memory
        if station_id not in _command_queue:
            _command_queue[station_id] = []
        _command_queue[station_id].append(command)
        logger.info(f"Command {command_id} added to memory queue for station {station_id}")
        return command_id
    
    async def get_pending(self, station_id: int) -> List[Dict]:
        """Get all pending commands for a station."""
        redis = _get_redis()
        commands = []
        
        if redis:
            try:
                all_cmds = await redis.hgetall(f"{self.prefix}{station_id}")
                for cmd_id, cmd_json in all_cmds.items():
                    try:
                        cmd = json.loads(cmd_json)
                        commands.append(cmd)
                    except Exception:
                        pass
                return commands
            except Exception as e:
                logger.warning(f"Redis command queue get failed: {e}")
        
        # Fallback to memory
        return _command_queue.get(station_id, [])
    
    async def remove(self, station_id: int, command_id: str) -> bool:
        """Remove a command from the queue."""
        redis = _get_redis()
        
        if redis:
            try:
                await redis.hdel(f"{self.prefix}{station_id}", command_id)
                return True
            except Exception as e:
                logger.warning(f"Redis command queue remove failed: {e}")
        
        # Fallback to memory
        if station_id in _command_queue:
            _command_queue[station_id] = [c for c in _command_queue[station_id] if c.get("command_id") != command_id]
        return True
    
    async def increment_retry(self, station_id: int, command_id: str) -> int:
        """Increment retry count for a command. Returns new count."""
        command = await self.get_command(station_id, command_id)
        if command:
            command["retry_count"] = command.get("retry_count", 0) + 1
            redis = _get_redis()
            if redis:
                try:
                    await redis.hset(f"{self.prefix}{station_id}", command_id, json.dumps(command))
                except Exception:
                    pass
            return command["retry_count"]
        return 0
    
    async def get_command(self, station_id: int, command_id: str) -> Optional[Dict]:
        """Get a specific command from the queue."""
        redis = _get_redis()
        
        if redis:
            try:
                cmd_json = await redis.hget(f"{self.prefix}{station_id}", command_id)
                if cmd_json:
                    return json.loads(cmd_json)
            except Exception:
                pass
        
        # Fallback to memory
        if station_id in _command_queue:
            for cmd in _command_queue[station_id]:
                if cmd.get("command_id") == command_id:
                    return cmd
        return None
    
    async def clear(self, station_id: int) -> None:
        """Clear all commands for a station."""
        redis = _get_redis()
        
        if redis:
            try:
                await redis.delete(f"{self.prefix}{station_id}")
            except Exception:
                pass
        
        if station_id in _command_queue:
            _command_queue[station_id] = []


command_queue = CommandQueue()


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
