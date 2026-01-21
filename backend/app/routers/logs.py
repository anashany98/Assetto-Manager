from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from typing import List, Optional
import time
from collections import deque
import logging
from .auth import require_agent_token, require_admin

# In-memory Circular Buffer (Max 1000 logs)
MAX_LOGS = 1000
log_buffer = deque(maxlen=MAX_LOGS)

class LogEntry(BaseModel):
    timestamp: float
    level: str
    source: str # 'server', 'agent-X', etc.
    message: str
    details: Optional[str] = None

class LogCreate(BaseModel):
    level: str
    source: str
    message: str
    details: Optional[str] = None

router = APIRouter(
    prefix="/system/logs",
    tags=["logs"]
)

@router.post("/", status_code=201, dependencies=[Depends(require_agent_token)])
async def submit_log(log: LogCreate):
    entry = LogEntry(
        timestamp=time.time(),
        level=log.level.upper(),
        source=log.source,
        message=log.message,
        details=log.details
    )
    log_buffer.append(entry)
    return {"status": "ok"}

@router.get("/", response_model=List[LogEntry], dependencies=[Depends(require_admin)])
async def get_logs(limit: int = 100):
    # Return last N logs, reversed (newest first)
    # Convert deque to list, slice it, and return reverse
    all_logs = list(log_buffer)
    return sorted(all_logs, key=lambda x: x.timestamp, reverse=True)[:limit]

# --- Internal Handler for Server Logs ---
# --- Internal Handler for Server Logs ---
class MemoryLogHandler(logging.Handler):
    def emit(self, record):
        # Recursion Guard & Safety
        try:
            # Avoid logging our own logging actions if they trigger logs
            if "logs" in record.filename or record.name == "api.logs":
                return

            msg = record.getMessage()
            entry = LogEntry(
                timestamp=record.created,
                level=record.levelname,
                source="server",
                message=msg,
                details=f"{record.filename}:{record.lineno}"
            )
            log_buffer.append(entry)
        except Exception:
            # NEVER crash the application because of a log failure
            pass
