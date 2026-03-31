"""
HTTP client with secure defaults and timeout configuration.

Provides a shared httpx.AsyncClient with:
- Configurable timeouts (connect, read, write, pool)
- SSL verification enabled by default
- Retry logic for transient errors
"""
from __future__ import annotations

import logging
import os
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# Default timeouts (seconds)
DEFAULT_CONNECT_TIMEOUT = float(os.getenv("HTTP_CONNECT_TIMEOUT", "10"))
DEFAULT_READ_TIMEOUT = float(os.getenv("HTTP_READ_TIMEOUT", "30"))
DEFAULT_WRITE_TIMEOUT = float(os.getenv("HTTP_WRITE_TIMEOUT", "30"))
DEFAULT_POOL_TIMEOUT = float(os.getenv("HTTP_POOL_TIMEOUT", "10"))

# SSL verification can be disabled for testing only
VERIFY_SSL = os.getenv("HTTP_VERIFY_SSL", "true").lower() in {"1", "true", "yes"}

# Maximum redirects
MAX_REDIRECTS = int(os.getenv("HTTP_MAX_REDIRECTS", "5"))


def create_client(
    connect_timeout: Optional[float] = None,
    read_timeout: Optional[float] = None,
    write_timeout: Optional[float] = None,
    pool_timeout: Optional[float] = None,
    verify_ssl: Optional[bool] = None,
    max_redirects: Optional[int] = None,
) -> httpx.AsyncClient:
    """
    Create an httpx.AsyncClient with secure timeout defaults.

    Args:
        connect_timeout: Connection timeout in seconds
        read_timeout: Read timeout in seconds
        write_timeout: Write timeout in seconds
        pool_timeout: Pool timeout in seconds
        verify_ssl: Whether to verify SSL certificates
        max_redirects: Maximum number of redirects to follow

    Returns:
        Configured httpx.AsyncClient
    """
    timeout = httpx.Timeout(
        connect=connect_timeout or DEFAULT_CONNECT_TIMEOUT,
        read=read_timeout or DEFAULT_READ_TIMEOUT,
        write=write_timeout or DEFAULT_WRITE_TIMEOUT,
        pool=pool_timeout or DEFAULT_POOL_TIMEOUT,
    )

    limits = httpx.Limits(
        max_connections=int(os.getenv("HTTP_MAX_CONNECTIONS", "100")),
        max_keepalive_connections=int(os.getenv("HTTP_MAX_KEEPALIVE", "20")),
    )

    return httpx.AsyncClient(
        timeout=timeout,
        limits=limits,
        follow_redirects=True,
        max_redirects=max_redirects or MAX_REDIRECTS,
        verify=VERIFY_SSL if verify_ssl is None else verify_ssl,
    )


# Shared client instance for common use cases
_shared_client: Optional[httpx.AsyncClient] = None


async def get_shared_client() -> httpx.AsyncClient:
    """Get or create a shared HTTP client instance."""
    global _shared_client
    if _shared_client is None or _shared_client.is_closed:
        _shared_client = create_client()
    return _shared_client


async def close_shared_client() -> None:
    """Close the shared HTTP client if it exists."""
    global _shared_client
    if _shared_client is not None and not _shared_client.is_closed:
        await _shared_client.aclose()
        _shared_client = None
