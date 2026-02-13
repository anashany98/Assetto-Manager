from __future__ import annotations

from collections import defaultdict, deque
from math import ceil
import os
from threading import Lock
from time import time
from typing import Any


_lock = Lock()
_started_at = time()
_counts: dict[str, int] = defaultdict(int)
_errors: dict[str, int] = defaultdict(int)
_latency_total_ms: dict[str, float] = defaultdict(float)
_latency_max_ms: dict[str, float] = defaultdict(float)
_max_keys = int(os.getenv("OBSERVABILITY_MAX_KEYS", "2000"))
_window_seconds = max(1, int(os.getenv("OBSERVABILITY_WINDOW_SECONDS", "300")))
_max_recent_events = int(os.getenv("OBSERVABILITY_MAX_RECENT_EVENTS", "50000"))
_overflow_key = "__overflow__"
# Keep per-request events for rolling SLO calculations.
_recent_events: deque[tuple[float, int, float]] = deque()


def _prune_recent(now_ts: float) -> None:
    cutoff = now_ts - _window_seconds
    while _recent_events and _recent_events[0][0] < cutoff:
        _recent_events.popleft()
    if _max_recent_events > 0:
        while len(_recent_events) > _max_recent_events:
            _recent_events.popleft()


def _percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    sorted_values = sorted(values)
    rank = int(ceil((p / 100.0) * len(sorted_values))) - 1
    rank = max(0, min(rank, len(sorted_values) - 1))
    return sorted_values[rank]


def record_request(method: str, path: str, status_code: int, duration_ms: float) -> None:
    key = f"{method} {path}"
    now_ts = time()
    with _lock:
        # Prevent unbounded growth if someone hits lots of unique paths (e.g. 404 spam).
        if _max_keys > 0 and key not in _counts and len(_counts) >= _max_keys:
            key = _overflow_key
        _counts[key] += 1
        if status_code >= 400:
            _errors[key] += 1
        _latency_total_ms[key] += duration_ms
        if duration_ms > _latency_max_ms[key]:
            _latency_max_ms[key] = duration_ms
        _recent_events.append((now_ts, int(status_code), float(duration_ms)))
        _prune_recent(now_ts)


def reset_metrics() -> None:
    with _lock:
        _counts.clear()
        _errors.clear()
        _latency_total_ms.clear()
        _latency_max_ms.clear()
        _recent_events.clear()


def snapshot() -> dict[str, Any]:
    with _lock:
        now_ts = time()
        _prune_recent(now_ts)

        total_requests = sum(_counts.values())
        total_errors = sum(_errors.values())
        routes = {}
        for key, count in _counts.items():
            total_ms = _latency_total_ms.get(key, 0.0)
            routes[key] = {
                "count": count,
                "errors": _errors.get(key, 0),
                "avg_ms": round(total_ms / count, 2) if count else 0.0,
                "max_ms": round(_latency_max_ms.get(key, 0.0), 2),
            }

        recent_requests = len(_recent_events)
        recent_client_errors = 0
        recent_server_errors = 0
        recent_latencies: list[float] = []
        for _, status_code, latency_ms in _recent_events:
            recent_latencies.append(latency_ms)
            if 400 <= status_code < 500:
                recent_client_errors += 1
            elif status_code >= 500:
                recent_server_errors += 1

        recent_total_errors = recent_client_errors + recent_server_errors
        recent_error_rate = (recent_total_errors / recent_requests) if recent_requests else 0.0
        recent_server_error_rate = (recent_server_errors / recent_requests) if recent_requests else 0.0
        recent_avg_ms = (sum(recent_latencies) / recent_requests) if recent_requests else 0.0
        recent_p95_ms = _percentile(recent_latencies, 95.0)
        recent_p99_ms = _percentile(recent_latencies, 99.0)

        return {
            "started_at": _started_at,
            "uptime_seconds": round(now_ts - _started_at, 2),
            "totals": {
                "requests": total_requests,
                "errors": total_errors,
            },
            "recent": {
                "window_seconds": _window_seconds,
                "requests": recent_requests,
                "client_errors": recent_client_errors,
                "server_errors": recent_server_errors,
                "errors": recent_total_errors,
                "error_rate": round(recent_error_rate, 4),
                "server_error_rate": round(recent_server_error_rate, 4),
                "avg_ms": round(recent_avg_ms, 2),
                "p95_ms": round(recent_p95_ms, 2),
                "p99_ms": round(recent_p99_ms, 2),
            },
            "routes": routes,
        }
