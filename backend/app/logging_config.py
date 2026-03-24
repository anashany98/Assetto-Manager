"""
Structured JSON logging for production environments.

In development, logs use a human-readable format.
In production (ENVIRONMENT=production), logs are emitted as JSON for ingestion
by log aggregators (Loki, CloudWatch, ELK, etc.).

Usage:
    from .logging_config import configure_logging
    configure_logging()
"""

import json
import logging
import os
import traceback
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path


ENVIRONMENT = (os.getenv("ENVIRONMENT", "development") or "development").lower().strip()


class JSONFormatter(logging.Formatter):
    """
    Formats log records as single-line JSON objects.
    Each field is always present so log aggregators can build consistent schemas.
    """

    # Fields present on every LogRecord that are not log-specific extras.
    _RECORD_BUILTINS = frozenset({
        "args", "asctime", "created", "exc_info", "exc_text",
        "filename", "funcName", "levelname", "levelno", "lineno",
        "message", "module", "msecs", "msg", "name", "pathname",
        "process", "processName", "relativeCreated", "stack_info",
        "taskName", "thread", "threadName",
    })

    def format(self, record: logging.LogRecord) -> str:
        log_obj: dict = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        if record.exc_info:
            log_obj["exception"] = self.formatException(record.exc_info)
        if record.stack_info:
            log_obj["stack_info"] = self.formatStack(record.stack_info)

        # Attach any extra= fields passed by the caller (e.g. request_id, duration_ms).
        for key, val in record.__dict__.items():
            if key not in self._RECORD_BUILTINS:
                log_obj[key] = val

        return json.dumps(log_obj, default=str, ensure_ascii=False)


class HumanFormatter(logging.Formatter):
    """Compact, coloured-friendly formatter for development consoles."""

    _FMT = "%(asctime)s %(levelname)-8s %(name)s  %(message)s"
    _DATEFMT = "%Y-%m-%d %H:%M:%S"

    def __init__(self):
        super().__init__(fmt=self._FMT, datefmt=self._DATEFMT)


def configure_logging(
    log_dir: Path | None = None,
    max_bytes: int | None = None,
    backup_count: int | None = None,
) -> None:
    """
    Configure root logger with:
    - A StreamHandler (stdout) using JSONFormatter in production, HumanFormatter in dev.
    - A RotatingFileHandler writing to <log_dir>/backend.log.

    Idempotent: calling it multiple times does not add duplicate handlers.
    """
    use_json = ENVIRONMENT == "production"
    formatter: logging.Formatter = JSONFormatter() if use_json else HumanFormatter()

    root = logging.getLogger()

    # --- Stream handler (stdout) ---
    if not any(isinstance(h, logging.StreamHandler) and not isinstance(h, RotatingFileHandler)
               for h in root.handlers):
        stream_handler = logging.StreamHandler()
        stream_handler.setLevel(logging.INFO)
        stream_handler.setFormatter(formatter)
        root.addHandler(stream_handler)

    # --- Rotating file handler ---
    if log_dir is None:
        from .paths import REPO_ROOT
        log_dir = Path(os.getenv("LOG_DIR", str(REPO_ROOT / "logs")))
    log_dir.mkdir(parents=True, exist_ok=True)
    log_path = log_dir / "backend.log"

    if not any(
        isinstance(h, RotatingFileHandler)
        and getattr(h, "baseFilename", "") == str(log_path)
        for h in root.handlers
    ):
        file_handler = RotatingFileHandler(
            str(log_path),
            maxBytes=max_bytes or int(os.getenv("LOG_MAX_BYTES", str(10 * 1024 * 1024))),
            backupCount=backup_count or int(os.getenv("LOG_BACKUP_COUNT", "5")),
            encoding="utf-8",
        )
        file_handler.setLevel(logging.INFO)
        # Always write JSON to file so log aggregators get structured data.
        file_handler.setFormatter(JSONFormatter())
        root.addHandler(file_handler)

    root.setLevel(logging.INFO)
