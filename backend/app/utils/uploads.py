import re
from pathlib import Path
from typing import Iterable
from fastapi import UploadFile, HTTPException

_FILENAME_CLEAN_RE = re.compile(r"[^A-Za-z0-9._-]+")


def sanitize_filename(name: str, fallback: str = "file") -> str:
    safe = Path(name).name
    safe = _FILENAME_CLEAN_RE.sub("_", safe).strip("._-")
    return safe or fallback


def ensure_allowed_extension(filename: str, allowed: Iterable[str]) -> str:
    ext = Path(filename).suffix.lower()
    allowed_set = {e.lower() for e in allowed}
    if ext not in allowed_set:
        raise HTTPException(status_code=400, detail="Invalid file type")
    return ext


def save_upload_file(upload: UploadFile, destination: Path, max_bytes: int) -> int:
    bytes_written = 0
    destination.parent.mkdir(parents=True, exist_ok=True)

    with open(destination, "wb") as buffer:
        while True:
            chunk = upload.file.read(1024 * 1024)
            if not chunk:
                break
            bytes_written += len(chunk)
            if bytes_written > max_bytes:
                buffer.close()
                try:
                    destination.unlink(missing_ok=True)
                except Exception:
                    pass
                raise HTTPException(status_code=413, detail="File too large")
            buffer.write(chunk)

    return bytes_written
